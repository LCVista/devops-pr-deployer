import fetch from 'node-fetch';
import { TerraformBackend } from './types';

export type ExistingVar = {
    id: string,
    name: string,
    value: string
}

export class TerraformCloudApi implements TerraformBackend {
    private readonly tfcApiToken: string;
    public readonly orgId: string;
    public readonly workspaceName: string;
    public readonly baseDomain: string;
    private readonly __fetch: (url, opts) => Promise<any>;
    private workspaceId: string;

    constructor(tfcApiToken: string,
                orgId: string,
                workspaceName: string,
                baseDomain: string | undefined = undefined,
                fetchMock: ((url, opts) => Promise<any>) | undefined = undefined
    ) {
        this.baseDomain = baseDomain ? baseDomain : "app.terraform.io";
        this.tfcApiToken = tfcApiToken;
        this.orgId = orgId;
        this.workspaceName = workspaceName;
        this.workspaceId = "";
        // for mocking
        this.__fetch = fetchMock ? fetchMock : fetch;
    }

    public configBlock(): string {
        return (
`terraform {
    cloud {
        hostname     = "${this.baseDomain}"
        organization = "${this.orgId}"
        workspaces {
        name = "${this.workspaceName}"
        }
    }
}`
        );
    }

    public async setVariable(existingValue, name, value): Promise<boolean> {
        const workspaceId = this.getWorkspaceId();
        let varId = existingValue ? existingValue.id : null;
        if (existingValue && existingValue.value === value) {
            console.log(`Skipping varId=${varId} key=${name} because value=${value} already present=${existingValue.value}`);
            return true;
        } else {
            console.log(`Setting variable varId=${varId} key='${name}' value='${value}'`);
        }
        let post_payload = {
            "data": {
                "type": "vars",
                "attributes": {
                    "key": name,
                    "value": value,
                    "description": "provided by PR",
                    "category": "terraform",
                    "hcl": name === "env_vars",
                    "sensitive": false
                }
            }
        }
        if (varId) {
            post_payload['data']['id'] = varId;
        }

        let url = (varId) ?
            `https://${this.baseDomain}/api/v2/workspaces/${workspaceId}/vars/${varId}`
            :
            `https://app.terraform.io/api/v2/workspaces/${workspaceId}/vars`
        ;
        console.log("vars-post-api = ", url);
        let response = await this.__fetch(url, {
            method: varId ? 'PATCH' : 'POST',
            headers: {
                "Authorization": `Bearer ${this.tfcApiToken}`,
                "Content-Type": "application/vnd.api+json",
            },
            body: JSON.stringify(post_payload)
        });

        if (response.ok) {
            return true;
        } else {
            console.log("Did not get OK response from terraform API");
            console.log(response.status, response.statusText);
            console.log(await response.json());
            return false;
        }
    }

    public async getExistingVars(): Promise<{[key: string]: ExistingVar}>{
        const workspaceId = this.getWorkspaceId();
        let url = `https://${this.baseDomain}/api/v2/workspaces/${workspaceId}/vars`;
        let response = await this.__fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${this.tfcApiToken}`,
                "Content-Type": "application/vnd.api+json",
            }
        });
        if (response.ok) {
            let body = await response.json() as any;
            return body.data.reduce( (accum, item) => {
                    accum[item.attributes.key] = {
                        'id': item.id,
                        'name': item.attributes.key,
                        'value': item.attributes.value
                    };
                    return accum;
                },
                {}
            );
        } else {
            throw new Error("Workspace does not exist")
        }
    }

    public async getWorkspaceId(): Promise<string>{
        if (this.workspaceId !== "") { return this.workspaceId; }

        let response = await this.__fetch(`https://${this.baseDomain}/api/v2/organizations/${this.orgId}/workspaces/${this.workspaceName}`, {
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${this.tfcApiToken}`,
                "Content-Type": "application/vnd.api+json",
            }
        });

        if (response.ok) {
            let body = await response.json() as any;
            this.workspaceId = body.data.id
            return this.workspaceId;
        } else {
            throw new Error("Workspace does not exist")
        }
    }
    
    public async deleteWorkspace(): Promise<boolean> {
        let response = await this.__fetch(`https://${this.baseDomain}/api/v2/organizations/${this.orgId}/workspaces/${this.workspaceName}`, {
            method: 'DELETE',
            headers: {
                "Authorization": `Bearer ${this.tfcApiToken}`,
                "Content-Type": "application/vnd.api+json",
            }
        });

        if (response.ok) {
            return true;
        } else {
            throw new Error("Workspace does not exist")
        }
    }
}