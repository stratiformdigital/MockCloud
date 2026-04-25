import type { AzureServiceDefinition } from '../types.js';
import { azureBlobStorageService } from './services/blob-storage/index.js';
import { azureKeyVaultService } from './services/keyvault/index.js';
import { azureArmService } from './services/arm/index.js';
import { azureAuthService } from './services/auth/index.js';
import { azureCosmosService } from './services/cosmos/index.js';
import { azureAppConfigurationService } from './services/app-configuration/index.js';
import { azureFunctionsService } from './services/functions/index.js';
import { azureEventGridService } from './services/eventgrid/index.js';
import { azureApiManagementService } from './services/api-management/index.js';
import { azureMonitorService } from './services/monitor/index.js';
import { azureGraphService } from './services/graph/index.js';
import { azureSearchService } from './services/search/index.js';
import { azureCognitiveServicesService } from './services/cognitive-services/index.js';
import { azureFoundryService } from './services/foundry/index.js';

const AZURE_SERVICES: AzureServiceDefinition[] = [
  azureBlobStorageService,
  azureKeyVaultService,
  azureArmService,
  azureAuthService,
  azureCosmosService,
  azureAppConfigurationService,
  azureFunctionsService,
  azureEventGridService,
  azureApiManagementService,
  azureMonitorService,
  azureGraphService,
  azureSearchService,
  azureCognitiveServicesService,
  azureFoundryService,
];

export function getAllAzureServices(): AzureServiceDefinition[] {
  return AZURE_SERVICES;
}
