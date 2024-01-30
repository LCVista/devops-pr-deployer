import fs from "fs";
import { ExistingVars, TerraformBackend, TFVars } from "./types";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { ExistingVar } from "./tfc_api";

export const TFVARS_FILENAME = 'terraform.tfvars.json';
export const TFSTATE_FILENAME = 'terraform.tfstate';

export class TerraformS3Api implements TerraformBackend {
    public readonly workspaceName: string;
    private readonly dynamodbTable: string;
    private readonly s3Bucket: string;
    private readonly s3Client: S3Client;
    private existingVars: ExistingVars;

    constructor(
        workspaceName: string,
        s3Bucket: string,
        dynamodbTable: string
    ) {
        this.s3Bucket = s3Bucket;
        this.dynamodbTable = dynamodbTable;
        this.s3Client = new S3Client();
        this.workspaceName = workspaceName;
        this.existingVars = {};
    }

    public configBlock(): string {
        return (
`terraform {
    backend "s3" {
        bucket = "${this.s3Bucket}"
        dynamodb_table = "${this.dynamodbTable}"
        key = "${this.tfStateS3Key}"
        region = "us-west-2"
    }
}`
        );
    }

    public async getExistingVars(): Promise<ExistingVars>{
        const s3cmd = new GetObjectCommand({
            "Bucket": this.s3Bucket,
            "Key": this.tfVarsS3Key
        })
        try {
            const resp = await this.s3Client.send(s3cmd);
            const respBody = (await resp.Body?.transformToString()) || "{}";
            const remoteVars = JSON.parse(respBody)
            console.log(`recieved remoteVars: ${JSON.stringify(remoteVars)}`)

            const reducer = (acc, key) => {
                acc[key] = {
                    id: "",
                    name: key,
                    value: remoteVars[key],
                };

                return acc;
            }
            this.existingVars = Object.keys(remoteVars).reduce(reducer, {});
        } catch (err) {
            if (err instanceof NoSuchKey) { 
                console.log('saved variable state not found. returning {}')
                return {};
            } else {
                throw err
            }
        }

        return this.existingVars;
    }

    public async setVariable(existingValue, name, value): Promise<boolean> {
        console.log('S3BackendApi: setVariable')
        if (existingValue && existingValue.value === value) {
            console.log(`Skipping key=${name} because value=${value} already present=${existingValue.value}`);
            return true;
        } 
        console.log(`Setting variable key='${name}' value='${value}'`);
        await this.updateExistingVars(name, value);

        return true;
    }

    public async deleteWorkspace(): Promise<boolean> {
        const deleteVars = new DeleteObjectCommand({
            Bucket: this.s3Bucket,
            Key: this.tfVarsS3Key
        })

        await this.s3Client.send(deleteVars)

        const deleteState = new DeleteObjectCommand({
            Bucket: this.s3Bucket,
            Key: this.tfStateS3Key
        })

        await this.s3Client.send(deleteState)

        return true;
    }

    private get tfVarsS3Key(): string {
        return `${this.workspaceName}/${TFVARS_FILENAME}`;
    }

    private get tfStateS3Key(): string {
        return `${this.workspaceName}/${TFSTATE_FILENAME}`;
    }

    private async updateExistingVars(name: string, value): Promise<boolean> {
        console.log('S3BackendApi: updateExistingVars')
        this.existingVars[name] = {name, value, id: ""}
        const tfvars = existingVarsToTfVars(this.existingVars)
        const tfvarsJson = JSON.stringify(tfvars)
        
        // write to local tfvars file
        fs.writeFileSync(TFVARS_FILENAME, tfvarsJson)
        console.log(`wrote to ${TFVARS_FILENAME}`);

        const inputs = {
            "Bucket": this.s3Bucket,
            "Key": this.tfVarsS3Key,
            "Body": tfvarsJson
        }
        const resp = await this.s3Client.send(new PutObjectCommand(inputs));
        console.log(`wrote to s3://${this.s3Bucket}/${this.tfVarsS3Key}`)

        return true;
    }
}

// convert an ExistingVars structure into a TFVars structure
export function existingVarsToTfVars(existingVars: ExistingVars): TFVars {
    const reducer = (acc, existingVar: ExistingVar) => {
        acc[existingVar.name] = existingVar.value;
        return acc;
    }
    return Object.values(existingVars).reduce(reducer, {});
}