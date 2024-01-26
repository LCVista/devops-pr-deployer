import { ExistingVar } from "./tfc_api";

export type ExistingVars = {
    [key: string]: ExistingVar;
}

export type TFVars = {
  [key: string]: string
}

export type TerraformBackend = {
  workspaceName: string;
  configBlock: () => string;
  setVariable: (existingValue: any, name: string, value: any) => Promise<boolean>;
  getExistingVars: () => Promise<ExistingVars>;
  deleteWorkspace: () => Promise<boolean>;
};