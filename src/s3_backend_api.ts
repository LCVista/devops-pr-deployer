import fs from "fs";
import { ExistingVars, TerraformBackend, TFVars } from "./types";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { ExistingVar } from "./tfc_api";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";

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
        dynamodbTable: string,
        fromBuilder: boolean = false
    ) {
        if (!fromBuilder) {
            throw Error('use TerraformS3Api.build()')
        }

        this.s3Bucket = s3Bucket;
        this.dynamodbTable = dynamodbTable;
        this.s3Client = new S3Client();
        this.workspaceName = workspaceName;
        this.existingVars = {};
    }

    // constructors can't be async, and we need to await getExistingVars at init time
    static async build(
        workspaceName: string,
        s3Bucket: string,
        dynamodbTable: string
    ): Promise<TerraformS3Api> {
        const api = new TerraformS3Api(workspaceName, s3Bucket, dynamodbTable, true)
        // need to call this to hydrate the in-memory variable store
        await api.getExistingVars();

        return api;
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
            const respBody = (await resp.Body?.transformToString()) || "{}"
            this.existingVars = JSON.parse(respBody)
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

        const inputs = {
            "Bucket": this.s3Bucket,
            "Key": this.tfVarsS3Key,
            "Body": JSON.stringify(this.existingVars)
        }
        const resp = await this.s3Client.send(new PutObjectCommand(inputs));
        console.log(`wrote existingVars to s3://${this.s3Bucket}/${this.tfVarsS3Key}`)

        
        // update local tfvars.json
        writeTfvarsFile(this.existingVars)

        return true;
    }
}

export function writeTfvarsFile(existingVars: ExistingVars): boolean {
    // convert from "ExistingVar(s)" format to tfvars.json format
    const reducer = (acc, existingVar: ExistingVar) => {
        acc[existingVar.name] = existingVar.value;
        return acc;
    }
    const tfvars = Object.values(existingVars).reduce(reducer, {});
    const tfvarsJson = JSON.stringify(tfvars)

    fs.writeFileSync(TFVARS_FILENAME, tfvarsJson)
    console.log(`wrote to ${TFVARS_FILENAME}:\n${tfvarsJson}`);

    return true
}