import fetch from 'node-fetch';

export async function setVariable(tfc_api_token, orgId, workspaceId, existingValue, name, value): Promise<boolean> {
    let varId = existingValue ? existingValue.id : null;
    if (existingValue && existingValue.value === value) {
        console.log (`Skipping varId=${varId} key=${name} because value=${value} already present=${existingValue.value}`);
        return true;
    } else {
        console.log(`Setting variable varId=${varId} key='${name}' value='${value}'`);
    }
    let post_payload = {
        "data": {
            "type":"vars",
            "attributes": {
                "key": name,
                "value": value,
                "description":"provided by PR",
                "category":"terraform",
                "hcl": name === "env_vars",
                "sensitive":false
            }
        }
    }
    if (varId) {
        post_payload['data']['id'] = varId;
    }

    let url = (varId) ? `https://app.terraform.io/api/v2/workspaces/${workspaceId}/vars/${varId}` : `https://app.terraform.io/api/v2/workspaces/${workspaceId}/vars`;
    console.log("vars-post-api = ", url);
    let response = await fetch(url, {
        method: varId ? 'PATCH' : 'POST',
        headers: {
            "Authorization": `Bearer ${tfc_api_token}`,
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

type ExistingVar = {
    id: string,
    name: string,
    value: string
}

export async function getExistingVars(tfc_api_token, orgId, workspaceId): Promise<{[key: string]: ExistingVar}>{
    let url = `https://app.terraform.io/api/v2/workspaces/${workspaceId}/vars`;
    let response = await fetch(url, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${tfc_api_token}`,
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

export async function getWorkspaceId(tfc_api_token, orgId, workspaceName): Promise<string>{
    let response = await fetch(`https://app.terraform.io/api/v2/organizations/${orgId}/workspaces/${workspaceName}`, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${tfc_api_token}`,
            "Content-Type": "application/vnd.api+json",
        }
    });

    if (response.ok) {
        let body = await response.json() as any;
        return body.data.id;
    } else {
        throw new Error("Workspace does not exist")
    }
}

export async function deleteWorkspace(tfc_api_token, orgId, workspaceName): Promise<boolean> {
    let response = await fetch(`https://app.terraform.io/api/v2/organizations/${orgId}/workspaces/${workspaceName}`, {
        method: 'DELETE',
        headers: {
            "Authorization": `Bearer ${tfc_api_token}`,
            "Content-Type": "application/vnd.api+json",
        }
    });

    if (response.ok) {
        return true;
    } else {
        throw new Error("Workspace does not exist")
    }
}