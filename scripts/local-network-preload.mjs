import { assertLocalMode, configureOfflineLocal } from '../lib/local-runtime.mjs';
import { installLocalNetworkGuard } from '../lib/local-network-guard.mjs';
assertLocalMode([]);
configureOfflineLocal(process.cwd());
installLocalNetworkGuard(process.cwd());
