import { ExistingVar } from "./tfc_api";

export type ExistingVars = {
    [key: string]: ExistingVar
}

export type TerraformBackend = {
  configBlock: () => string,
  setVariable: (workspaceId: string, existingValue: any, name: string, value: any) => Promise<boolean>
  getExistingVars: () => Promise<ExistingVars>
  deleteWorkspace: () => Promise<boolean>
};