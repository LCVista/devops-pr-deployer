terraform {
    cloud {
        hostname     = "app.terraform.io"
        organization = "test_org"
        workspaces {
        name = "test_workspace"
        }
    }
}