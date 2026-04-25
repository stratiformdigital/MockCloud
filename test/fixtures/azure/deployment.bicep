param containerName string
param secretName string
@secure()
param secretValue string
param location string = resourceGroup().location

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'mockcloud'
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/${containerName}'
  properties: {
    publicAccess: 'None'
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'mockvault'
  location: location
  properties: {
    tenantId: '00000000-0000-0000-0000-000000000000'
    sku: {
      family: 'A'
      name: 'standard'
    }
    accessPolicies: []
  }
}

resource secret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${vault.name}/${secretName}'
  tags: {
    source: 'bicep'
  }
  properties: {
    value: secretValue
    contentType: 'text/plain'
  }
}

output containerResourceId string = container.id
output secretResourceId string = secret.id
output storageKey string = listKeys(storage.id, storage.apiVersion).keys[0].value
