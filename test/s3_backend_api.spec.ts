import fs from "fs";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "stream";
import { TFVARS_FILENAME, TerraformS3Api } from "../src/s3_backend_api";

let existingVarsJson = JSON.stringify({
    "var1":  {
        id: "",
        name: "var1",
        value: "val1"
    }
});

const s3Mock =  mockClient(S3Client);

const writeSpy = jest.spyOn(fs, 'writeFileSync');

beforeEach(() => {
    jest.resetAllMocks();
    s3Mock.reset();

    s3Mock.on(GetObjectCommand).callsFake((_input) => {
        const stream = new Readable();
        stream.push(existingVarsJson);
        stream.push(null); // end of stream
        return { Body: sdkStreamMixin(stream) };
    });
})

test('#getExistingVars', async () => {
    const subject = await TerraformS3Api.build(
        'workspace-name', 
        's3-bucket', 
    );

    const output = await subject.getExistingVars();

    expect(JSON.stringify(output)).toEqual(existingVarsJson)
})

test('#setVariable', async () => {
    const subject = await TerraformS3Api.build(
        'workspace-name', 
        's3-bucket', 
    );
    await subject.setVariable('', 'new', 'value');

    const expectedBody = {
        "var1":  {
            id: "",
            name: "var1",
            value: "val1"
        },
        "new": {
            id: "",
            name: "new",
            value: "value"
        }
    };

    // expect s3 to get updated with the proper format
    const uploadCalls = s3Mock.commandCalls(PutObjectCommand)
    const parsedBody = JSON.parse(uploadCalls[0].firstArg.input.Body)

    expect(uploadCalls.length).toBe(1)
    expect(parsedBody).toEqual(expectedBody)

    // expect tfvars.json file is written with the correct format
    const content = JSON.stringify({var1: 'val1', new: 'value'})
    expect(writeSpy).toHaveBeenCalledWith(TFVARS_FILENAME, content)
})

test('#listWorkspaceBranches returns branch names from S3 keys', async () => {
    const subject = await TerraformS3Api.build(
        'zpr-my-branch',
        's3-bucket',
    );

    s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
            { Key: 'zpr-JUR-1998-new-jurisdiction/terraform.tfstate' },
            { Key: 'zpr-JUR-1998-new-jurisdiction/terraform.tfvars.json' },
            { Key: 'zpr-JUR-2003-new-jurisdiction/terraform.tfstate' },
            { Key: 'zpr-some-other-branch/terraform.tfstate' },
        ],
        IsTruncated: false,
    });

    const branches = await subject.listWorkspaceBranches('my-branch');

    expect(branches).toEqual([
        'JUR-1998-new-jurisdiction',
        'JUR-2003-new-jurisdiction',
        'some-other-branch',
    ]);
})

test('#listWorkspaceBranches handles pagination', async () => {
    const subject = await TerraformS3Api.build(
        'zpr-my-branch',
        's3-bucket',
    );

    s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
            Contents: [
                { Key: 'zpr-branch-a/terraform.tfstate' },
            ],
            IsTruncated: true,
            NextContinuationToken: 'token-1',
        })
        .resolvesOnce({
            Contents: [
                { Key: 'zpr-branch-b/terraform.tfstate' },
            ],
            IsTruncated: false,
        });

    const branches = await subject.listWorkspaceBranches('my-branch');

    expect(branches).toEqual(['branch-a', 'branch-b']);
    expect(s3Mock.commandCalls(ListObjectsV2Command).length).toBe(2);
})

test('#listWorkspaceBranches returns empty for empty bucket', async () => {
    const subject = await TerraformS3Api.build(
        'zpr-my-branch',
        's3-bucket',
    );

    s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [],
        IsTruncated: false,
    });

    const branches = await subject.listWorkspaceBranches('my-branch');

    expect(branches).toEqual([]);
})