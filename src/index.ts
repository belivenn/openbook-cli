import { Connection, PublicKey } from "@solana/web3.js";
import { Market } from "@project-serum/serum";

// Program IDs
const OPENBOOK_PROGRAM_ID = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
const SERUM_PROGRAM_ID = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

// Connection to Solana
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// Helper function to safely create PublicKey instances
function createPublicKey(address: string): PublicKey {
    try {
        return new PublicKey(address);
    } catch (error) {
        throw new Error("Invalid public key format");
    }
}

// Helper function to show usage information
function showUsage(): void {
    console.log("\nUsage:");
    console.log("  openbook-cli <market_address>                       # Fetch market (auto-detects program)");
    console.log("  openbook-cli <market_address> --add                 # Add market (auto-detects program)");
    console.log("  openbook-cli --list                                 # List OpenBook markets");
    console.log("  openbook-cli --list --serum                         # List Serum markets");
    console.log("  openbook-cli --version                              # Show version");
    console.log("  openbook-cli --update                               # Update to latest version");
    console.log("  openbook-cli --help                                 # Show this help");
    console.log("\nExamples:");
    console.log("  openbook-cli 3ySaxSspDCsEM53zRTfpyr9s9yfq9yNpZFXSEbvbadLf");
    console.log("  openbook-cli 3ySaxSspDCsEM53zRTfpyr9s9yfq9yNpZFXSEbvbadLf --add");
    console.log("\nAuto-detection:");
    console.log("  The system automatically detects if a market is OpenBook or Serum");
    console.log("  No need to specify --serum flag for most operations");
}

// Helper function to check if an address is a valid market
async function isValidMarket(marketAddress: string, useSerum: boolean = false): Promise<boolean> {
    try {
        const marketPubkey = createPublicKey(marketAddress);
        const marketAccount = await connection.getAccountInfo(marketPubkey);
        
        if (!marketAccount) {
            return false;
        }
        
        const expectedProgramId = useSerum ? SERUM_PROGRAM_ID : OPENBOOK_PROGRAM_ID;
        return marketAccount.owner.toString() === expectedProgramId;
    } catch (error) {
        return false;
    }
}

interface OrderBookLevel {
    price: number;
    size: number;
    side: 'bid' | 'ask';
}

interface MarketInfo {
    address: string;
    baseMint: string;
    quoteMint: string;
    baseSymbol: string;
    quoteSymbol: string;
    minOrderSize: number;
    priceTick: number;
    eventQueueLength: number;
    requestQueueLength: number;
    bidsLength: number;
    asksLength: number;
}

interface TokenMetadata {
    symbol: string;
    name: string;
    decimals: number;
}

// Known markets and symbols - will be loaded from JSON file
let KNOWN_MARKETS: { [key: string]: any } = {};
let KNOWN_TOKEN_SYMBOLS: { [key: string]: string } = {};

async function getTokenMetadata(mintAddress: string): Promise<TokenMetadata> {
    try {
        const mintPubkey = createPublicKey(mintAddress);
        
        // First check if we have a known symbol
        const knownSymbol = KNOWN_TOKEN_SYMBOLS[mintAddress as keyof typeof KNOWN_TOKEN_SYMBOLS];
        if (knownSymbol) {
            return {
                symbol: knownSymbol,
                name: knownSymbol,
                decimals: 6 // Default for most tokens
            };
        }
        
        // Get token account info to extract decimals
        const tokenInfo = await connection.getParsedAccountInfo(mintPubkey);
        
        if (!tokenInfo.value) {
            throw new Error("Token account not found");
        }
        
        const parsedData = tokenInfo.value.data as any;
        const decimals = parsedData.parsed.info.decimals;
        
        // Simple fallback: use first 8 characters of mint address as symbol
        return {
            symbol: mintAddress.slice(0, 8),
            name: "Unknown Token",
            decimals: decimals
        };
        
    } catch (error) {
        console.error(`Error fetching token metadata for ${mintAddress}:`, error);
        return {
            symbol: mintAddress.slice(0, 8),
            name: "Unknown Token",
            decimals: 6
        };
    }
}

async function getMarketInfo(marketAddress: string, useSerum: boolean = false): Promise<MarketInfo> {
    try {
        // First try to get from known markets
        const marketData = KNOWN_MARKETS[marketAddress as keyof typeof KNOWN_MARKETS];
        
        if (marketData) {
            // Fetch real token metadata from blockchain
            const baseMetadata = await getTokenMetadata(marketData.baseMint);
            const quoteMetadata = await getTokenMetadata(marketData.quoteMint);
            
            return {
                address: marketAddress,
                baseMint: marketData.baseMint,
                quoteMint: marketData.quoteMint,
                baseSymbol: baseMetadata.symbol,
                quoteSymbol: quoteMetadata.symbol,
                minOrderSize: marketData.minOrderSize,
                priceTick: marketData.priceTick,
                eventQueueLength: marketData.eventQueueLength,
                requestQueueLength: marketData.requestQueueLength,
                bidsLength: marketData.bidsLength,
                asksLength: marketData.asksLength
            };
        } else {
            // Load market directly from blockchain
            const market = await loadOpenBookMarket(marketAddress, useSerum);
            
            // Fetch real token metadata from blockchain
            const baseMetadata = await getTokenMetadata(market.baseMintAddress.toString());
            const quoteMetadata = await getTokenMetadata(market.quoteMintAddress.toString());
            
            return {
                address: marketAddress,
                baseMint: market.baseMintAddress.toString(),
                quoteMint: market.quoteMintAddress.toString(),
                baseSymbol: baseMetadata.symbol,
                quoteSymbol: quoteMetadata.symbol,
                minOrderSize: 1, // Default values for unknown markets
                priceTick: 0.0001,
                eventQueueLength: 2978,
                requestQueueLength: 63,
                bidsLength: 909,
                asksLength: 909
            };
        }
    } catch (error) {
        // Re-throw the error with better context
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Failed to fetch market info");
    }
}

async function getMarketAccounts(marketAddress: string, useSerum: boolean = false) {
    try {
        const marketPubkey = createPublicKey(marketAddress);
        const marketAccount = await connection.getAccountInfo(marketPubkey);
        
        if (!marketAccount) {
            throw new Error("Market account not found");
        }
        
        console.log("Market account found!");
        console.log("Owner:", marketAccount.owner.toString());
        console.log("Data length:", marketAccount.data.length);
        
        // Check against the appropriate program ID
        const expectedProgramId = useSerum ? SERUM_PROGRAM_ID : OPENBOOK_PROGRAM_ID;
        const programName = useSerum ? "Serum" : "OpenBook";
        
        if (marketAccount.owner.toString() !== expectedProgramId) {
            throw new Error(`Market not owned by ${programName} program. Owner: ${marketAccount.owner.toString()}`);
        }
        
        return marketAccount;
    } catch (error) {
        // Re-throw the error with better context
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Failed to fetch market accounts");
    }
}

async function loadOpenBookMarket(marketAddress: string, useSerum: boolean = false): Promise<Market> {
    try {
        const marketPubkey = createPublicKey(marketAddress);
        
        // Use the appropriate program ID based on mode
        const programId = useSerum ? SERUM_PROGRAM_ID : OPENBOOK_PROGRAM_ID;
        
        // Load the market using the appropriate program ID
        const market = await Market.load(
            connection,
            marketPubkey,
            {},
            createPublicKey(programId)
        );
        
        const programName = useSerum ? "Serum" : "OpenBook";
        console.log(`✅ ${programName} market loaded successfully!`);
        
        return market;
    } catch (error) {
        const programName = useSerum ? "Serum" : "OpenBook";
        
        // Check if it's a program ownership error
        if (error instanceof Error && error.message.includes("Address not owned by program")) {
            throw new Error(`Market not owned by ${programName} program`);
        }
        
        // Check if it's a market not found error
        if (error instanceof Error && error.message.includes("Market account not found")) {
            throw new Error("Market account not found");
        }
        
        // For other errors, provide a generic message
        throw new Error(`Failed to load ${programName} market: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function getRealOrderBook(marketAddress: string, depth: number = 20, useSerum: boolean = false): Promise<{
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
}> {
    try {
        const programName = useSerum ? "Serum" : "OpenBook";
        console.log(`🔄 Fetching real order book from ${programName}...`);
        
        // Load the market with appropriate program
        const market = await loadOpenBookMarket(marketAddress, useSerum);
        
        // Use the correct Serum SDK methods
        console.log("📊 Loading bids and asks...");
        const bids = await market.loadBids(connection);
        const asks = await market.loadAsks(connection);
        
        // Access the orderbook data
        const bidsArray = bids.getL2(20); // Get top 20 bids
        const asksArray = asks.getL2(20); // Get top 20 asks
        
        console.log("📊 Orderbook loaded successfully!");
        console.log("Bids count:", bidsArray.length);
        console.log("Asks count:", asksArray.length);
        
        // Process bids (buy orders)
        const bidOrders: OrderBookLevel[] = bidsArray.map((bid: any) => ({
            price: bid[0], // Price is first element
            size: bid[1],  // Size is second element
            side: 'bid' as const
        }));
        
        // Process asks (sell orders)
        const askOrders: OrderBookLevel[] = asksArray.map((ask: any) => ({
            price: ask[0], // Price is first element
            size: ask[1],  // Size is second element
            side: 'ask' as const
        }));
        
        console.log(`✅ Real order book fetched: ${bidOrders.length} bids, ${askOrders.length} asks`);
        
        return { bids: bidOrders, asks: askOrders };
        
    } catch (error) {
        // Re-throw the error with better context
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Failed to fetch order book");
    }
}

async function getOrderBook(marketAddress: string, depth: number = 20): Promise<{
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
}> {
    try {
        // First, get the market account to verify it's a valid OpenBook market
        const marketAccount = await getMarketAccounts(marketAddress);
        
        // Get real order book data from the blockchain
        return await getRealOrderBook(marketAddress, depth);
        
    } catch (error) {
        console.error("Error fetching order book from blockchain:", error);
        throw error;
    }
}

async function getMarketStats(marketAddress: string, useSerum: boolean = false): Promise<{
    totalBids: number;
    totalAsks: number;
    bestBid: number | null;
    bestAsk: number | null;
    spread: number | null;
    spreadPercentage: number | null;
}> {
    try {
        const { bids, asks } = await getRealOrderBook(marketAddress, 1, useSerum);
        
        const bestBid = bids.length > 0 ? bids[0].price : null;
        const bestAsk = asks.length > 0 ? asks[0].price : null;
        
        const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
        const spreadPercentage = spread && bestBid ? (spread / bestBid) * 100 : null;
        
        return {
            totalBids: bids.length,
            totalAsks: asks.length,
            bestBid,
            bestAsk,
            spread,
            spreadPercentage
        };
    } catch (error) {
        console.error("Error fetching market stats:", error);
        throw error;
    }
}

async function displayOrderBook(marketAddress: string, depth: number = 10, useSerum: boolean = false): Promise<void> {
    try {
        const marketData = KNOWN_MARKETS[marketAddress as keyof typeof KNOWN_MARKETS];
        let marketName = marketData?.name || marketAddress;
        
        // Try to get real symbols for the market name
        try {
            const marketInfo = await getMarketInfo(marketAddress, useSerum);
            marketName = `${marketInfo.baseSymbol}/${marketInfo.quoteSymbol}`;
        } catch (error) {
            // Use fallback name if metadata fetch fails
        }
        
        console.log(`\n📊 Order Book for Market: ${marketName}`);
        console.log("=" .repeat(60));
        
        const { bids, asks } = await getRealOrderBook(marketAddress, depth, useSerum);
        
        console.log("\n🔴 ASKS (Sell Orders):");
        console.log("Price           Size");
        console.log("-" .repeat(30));
        
        // Display asks in reverse order (highest price first)
        asks.slice().reverse().forEach((ask) => {
            const priceStr = ask.price.toFixed(4);
            const sizeStr = ask.size.toFixed(4);
            console.log(`${priceStr.padEnd(15)}${sizeStr}`);
        });
        
        console.log("\n🟢 BIDS (Buy Orders):");
        console.log("Price           Size");
        console.log("-" .repeat(30));
        
        bids.forEach((bid) => {
            const priceStr = bid.price.toFixed(4);
            const sizeStr = bid.size.toFixed(4);
            console.log(`${priceStr.padEnd(15)}${sizeStr}`);
        });
        
        // Calculate market stats from the order book data we already have
        const bestBid = bids.length > 0 ? bids[0].price : null;
        const bestAsk = asks.length > 0 ? asks[0].price : null;
        const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
        const spreadPercentage = spread && bestBid ? (spread / bestBid) * 100 : null;
        
        console.log("\n📈 Market Stats:");
        console.log(`Total Bids: ${bids.length}`);
        console.log(`Total Asks: ${asks.length}`);
        console.log(`Best Bid: ${bestBid?.toFixed(4) || 'N/A'}`);
        console.log(`Best Ask: ${bestAsk?.toFixed(4) || 'N/A'}`);
        console.log(`Spread: ${spread?.toFixed(4) || 'N/A'}`);
        console.log(`Spread %: ${spreadPercentage?.toFixed(2) || 'N/A'}%`);
        
    } catch (error) {
        if (error instanceof Error) {
            console.error(`❌ Error: ${error.message}`);
        } else {
            console.error("❌ Error: Failed to display order book");
        }
    }
}

async function displayMarketInfo(marketAddress: string, useSerum: boolean = false): Promise<void> {
    try {
        const marketData = KNOWN_MARKETS[marketAddress as keyof typeof KNOWN_MARKETS];
        let marketName = marketData?.name || marketAddress;
        
        // Try to get real symbols for the market name
        try {
            const marketInfo = await getMarketInfo(marketAddress, useSerum);
            marketName = `${marketInfo.baseSymbol}/${marketInfo.quoteSymbol}`;
        } catch (error) {
            // Use fallback name if metadata fetch fails
        }
        
        console.log(`\n🏪 Market Information for: ${marketName}`);
        console.log("=" .repeat(60));
        
        const marketInfo = await getMarketInfo(marketAddress, useSerum);
        
        console.log(`Market Address: ${marketInfo.address}`);
        console.log(`Base Mint: ${marketInfo.baseMint} (${marketInfo.baseSymbol})`);
        console.log(`Quote Mint: ${marketInfo.quoteMint} (${marketInfo.quoteSymbol})`);
        console.log(`Min Order Size: ${marketInfo.minOrderSize}`);
        console.log(`Price Tick: ${marketInfo.priceTick}`);
        console.log(`Event Queue Length: ${marketInfo.eventQueueLength}`);
        console.log(`Request Queue Length: ${marketInfo.requestQueueLength}`);
        console.log(`Bids Length: ${marketInfo.bidsLength}`);
        console.log(`Asks Length: ${marketInfo.asksLength}`);
        
        // Verify the market account
        try {
            await getMarketAccounts(marketAddress, useSerum);
            const programName = useSerum ? "Serum" : "OpenBook";
            console.log(`✅ Market verified as ${programName} market`);
        } catch (error) {
            console.log(`❌ Market verification failed: ${error}`);
        }
        
    } catch (error) {
        if (error instanceof Error) {
            console.error(`❌ Error: ${error.message}`);
        } else {
            console.error("❌ Error: Failed to display market info");
        }
    }
}

function listKnownMarkets(useSerum: boolean = false): void {
    const programType = useSerum ? "Serum" : "OpenBook";
    console.log(`\n📋 Known ${programType} Markets:`);
    console.log("=" .repeat(60));
    
    Object.entries(KNOWN_MARKETS).forEach(([address, market]) => {
        console.log(`${market.name}: ${address}`);
    });
}

// Function to add market to known markets
async function addMarketToKnownMarkets(marketAddress: string, useSerum: boolean = false): Promise<void> {
    try {
        console.log(`🔍 Analyzing market: ${marketAddress}`);
        
        // Load the market to get base and quote mints
        const market = await loadOpenBookMarket(marketAddress, useSerum);
        
        // Get token metadata for base and quote tokens
        const baseMetadata = await getTokenMetadata(market.baseMintAddress.toString());
        const quoteMetadata = await getTokenMetadata(market.quoteMintAddress.toString());
        
        // Create market info
        const marketInfo = {
            name: `${baseMetadata.symbol}/${quoteMetadata.symbol}`,
            baseMint: market.baseMintAddress.toString(),
            quoteMint: market.quoteMintAddress.toString(),
            minOrderSize: 1,
            priceTick: 0.0001,
            eventQueueLength: 2978,
            requestQueueLength: 63,
            bidsLength: 909,
            asksLength: 909
        };
        
        // Add to known markets
        (KNOWN_MARKETS as any)[marketAddress] = marketInfo;
        
        // Add token symbols to known symbols if not already present
        if (!KNOWN_TOKEN_SYMBOLS[market.baseMintAddress.toString() as keyof typeof KNOWN_TOKEN_SYMBOLS]) {
            (KNOWN_TOKEN_SYMBOLS as any)[market.baseMintAddress.toString()] = baseMetadata.symbol;
        }
        
        if (!KNOWN_TOKEN_SYMBOLS[market.quoteMintAddress.toString() as keyof typeof KNOWN_TOKEN_SYMBOLS]) {
            (KNOWN_TOKEN_SYMBOLS as any)[market.quoteMintAddress.toString()] = quoteMetadata.symbol;
        }
        
        console.log("✅ Market added to known markets!");
        console.log(`Market: ${marketInfo.name}`);
        console.log(`Base Token: ${baseMetadata.symbol} (${market.baseMintAddress.toString()})`);
        console.log(`Quote Token: ${quoteMetadata.symbol} (${market.quoteMintAddress.toString()})`);
        
        // Display the updated known markets
        console.log("\n📋 Updated Known Markets:");
        Object.entries(KNOWN_MARKETS).forEach(([address, info]) => {
            console.log(`${info.name}: ${address}`);
        });
        
    } catch (error) {
        console.error("❌ Error adding market to known markets:", error);
        throw error;
    }
}

// Function to save known markets to a file (for persistence)
function saveKnownMarketsToFile(useSerum: boolean = false): void {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const marketsData = {
            markets: KNOWN_MARKETS,
            symbols: KNOWN_TOKEN_SYMBOLS
        };
        
        // Choose the appropriate file based on program type
        const fileName = useSerum ? 'known_serum_markets.json' : 'known_openbook_markets.json';
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, JSON.stringify(marketsData, null, 2));
        
        const programType = useSerum ? 'Serum' : 'OpenBook';
        console.log(`💾 Known ${programType} markets saved to ${fileName}`);
    } catch (error) {
        console.error("❌ Error saving known markets:", error);
    }
}

// Function to load known markets from file
function loadKnownMarketsFromFile(useSerum: boolean = false): void {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Choose the appropriate file based on program type
        const fileName = useSerum ? 'known_serum_markets.json' : 'known_openbook_markets.json';
        const filePath = path.join(__dirname, fileName);
        
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Load data from file
            KNOWN_MARKETS = data.markets || {};
            KNOWN_TOKEN_SYMBOLS = data.symbols || {};
            
            const programType = useSerum ? 'Serum' : 'OpenBook';
            console.log(`📂 Loaded known ${programType} markets from file`);
            console.log(`📊 Found ${Object.keys(KNOWN_MARKETS).length} markets and ${Object.keys(KNOWN_TOKEN_SYMBOLS).length} token symbols`);
        } else {
            const programType = useSerum ? 'Serum' : 'OpenBook';
            console.log(`ℹ️  No saved ${programType} markets file found, starting with empty markets`);
            // Initialize with empty objects
            KNOWN_MARKETS = {};
            KNOWN_TOKEN_SYMBOLS = {};
        }
    } catch (error) {
        const programType = useSerum ? 'Serum' : 'OpenBook';
        console.log(`ℹ️  Error loading ${programType} markets file, starting with empty markets`);
        KNOWN_MARKETS = {};
        KNOWN_TOKEN_SYMBOLS = {};
    }
}

// Main function to run the fetcher
async function main() {
    try {
        console.log("🚀 OpenBook Order Fetcher");
        console.log("=" .repeat(60));
        
        // Check if a specific market address was provided
        const args = process.argv.slice(2);
        
        // Handle help flag
        if (args.includes('--help') || args.includes('-h')) {
            console.log("🚀 OpenBook CLI - Command Line Interface");
            console.log("=" .repeat(60));
            console.log("\nUsage:");

            console.log("  openbook-cli <market_address>                       # Fetch market (auto-detects program)");
            console.log("  openbook-cli <market_address> --add                 # Add market (auto-detects program)");
            console.log("  openbook-cli --list                                 # List OpenBook markets");
            console.log("  openbook-cli --list --serum                         # List Serum markets");
            console.log("  openbook-cli --version                              # Show version");
            console.log("  openbook-cli --update                               # Update to latest version");
            console.log("\nAuto-detection:");
            console.log("  The system automatically detects if a market is OpenBook or Serum");
            console.log("  No need to specify --serum flag for most operations");
            console.log("\nFiles:");
            console.log("  Market files are stored in the CLI installation directory");
            console.log("  known_openbook_markets.json                         # OpenBook markets");
            console.log("  known_serum_markets.json                            # Serum markets");
            return;
        }

        // Handle version flag
        if (args.includes('--version') || args.includes('-v')) {
            try {
                const fs = require('fs');
                const path = require('path');
                
                // Try to find package.json in various locations
                let packageJsonPath = '';
                const possiblePaths = [
                    path.join(__dirname, '../package.json'),
                    path.join(__dirname, '../../package.json'),
                    path.join(process.cwd(), 'package.json')
                ];
                
                for (const pkgPath of possiblePaths) {
                    if (fs.existsSync(pkgPath)) {
                        packageJsonPath = pkgPath;
                        break;
                    }
                }
                
                if (packageJsonPath) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    console.log(`openbook-cli v${packageJson.version}`);
                } else {
                    // If we can't find package.json, try to get version from npm
                    try {
                        const { execSync } = require('child_process');
                        const version = execSync('npm list -g openbook-cli --depth=0', { encoding: 'utf8' });
                        const match = version.match(/openbook-cli@([^\s]+)/);
                        if (match) {
                            console.log(`openbook-cli v${match[1]}`);
                        } else {
                            console.log('openbook-cli (version unknown)');
                        }
                    } catch (error) {
                        console.log('openbook-cli (version unknown)');
                    }
                }
            } catch (error) {
                console.log('openbook-cli (version unknown)');
            }
            return;
        }

        // Handle update flag
        if (args.includes('--update')) {
            console.log("🔄 Checking for updates...");
            try {
                const https = require('https');
                const fs = require('fs');
                const path = require('path');
                const { execSync } = require('child_process');
                
                // Get current version dynamically
                let currentVersion = 'unknown';
                try {
                    // First try to get from package.json
                    const packageJsonPath = path.join(__dirname, '../package.json');
                    if (fs.existsSync(packageJsonPath)) {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                        currentVersion = packageJson.version;
                    } else {
                        // If no package.json, try to get from npm
                        const version = execSync('npm list -g openbook-cli --depth=0', { encoding: 'utf8' });
                        const match = version.match(/openbook-cli@([^\s]+)/);
                        if (match) {
                            currentVersion = match[1];
                        }
                    }
                } catch (error) {
                    // Version will remain 'unknown'
                }
                
                console.log(`📦 Current version: ${currentVersion}`);
                
                // Fetch latest release from GitHub
                const options = {
                    hostname: 'api.github.com',
                    path: '/repos/belivenn/openbook-cli/releases/latest',
                    method: 'GET',
                    headers: {
                        'User-Agent': 'openbook-cli-updater'
                    }
                };
                
                const req = https.request(options, (res: any) => {
                    let data = '';
                    
                    res.on('data', (chunk: any) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            const release = JSON.parse(data);
                            const latestVersion = release.tag_name.replace('v', '');
                            
                            console.log(`📦 Latest version: ${latestVersion}`);
                            
                            if (latestVersion === currentVersion) {
                                console.log("✅ You're already running the latest version!");
                                return;
                            }
                            
                            console.log("🔄 New version available! Updating...");
                            
                            // Install the latest version
                            execSync(`npm install -g openbook-cli@${latestVersion}`, { stdio: 'inherit' });
                            
                            console.log("✅ Update completed successfully!");
                            console.log(`🔄 Updated from v${currentVersion} to v${latestVersion}`);
                            console.log("🔄 Please restart your terminal or run 'openbook-cli --version' to verify.");
                            
                        } catch (error) {
                            console.error("❌ Error parsing release data:", error);
                            console.log("💡 Try running: npm install -g openbook-cli@latest");
                        }
                    });
                });
                
                req.on('error', (error: any) => {
                    console.error("❌ Error checking for updates:", error);
                    console.log("💡 Try running: npm install -g openbook-cli@latest");
                });
                
                req.end();
                
            } catch (error) {
                console.error("❌ Error updating openbook-cli:", error);
                console.log("💡 Try running: npm install -g openbook-cli@latest");
            }
            return;
        }
        
        // Check if market address is provided
        if (!args[0]) {
            console.log("❌ Error: Market address is required");
            showUsage();
            return;
        }
        
        const targetMarket = args[0];
        
        // Check for --serum flag first
        const useSerumFlag = args.includes('--serum') || args.includes('-s');
        
        // Auto-detect program type based on market ownership
        let useSerum = useSerumFlag;
        let detectedProgram = useSerumFlag ? "Serum" : "OpenBook";
        
        // If a specific market is provided, try to detect its program
        if (args[0] && !args.includes('--list') && !args.includes('-l')) {
            try {
                const marketPubkey = createPublicKey(targetMarket);
                const marketAccount = await connection.getAccountInfo(marketPubkey);
                
                if (marketAccount) {
                    const owner = marketAccount.owner.toString();
                    if (owner === SERUM_PROGRAM_ID) {
                        useSerum = true;
                        detectedProgram = "Serum";
                    } else if (owner === OPENBOOK_PROGRAM_ID) {
                        useSerum = false;
                        detectedProgram = "OpenBook";
                    } else {
                        // The account exists but is not owned by OpenBook or Serum
                        console.error("❌ Error: The provided address is not a valid market");
                        console.error("   The address exists but is not owned by OpenBook or Serum programs");
                        console.error("   Please provide a valid market address");
                        showUsage();
                        return;
                    }
                    console.log(`🔍 Auto-detected: ${detectedProgram} market`);
                } else {
                    // Account doesn't exist
                    console.error("❌ Error: Market account not found");
                    console.error("   The provided address does not exist on Solana");
                    console.error("   Please provide a valid market address");
                    showUsage();
                    return;
                }
            } catch (error) {
                if (error instanceof Error && error.message === "Invalid public key format") {
                    console.error("❌ Error: Invalid public key format. Please ensure it's a valid Solana address.");
                    showUsage();
                    return;
                }
                console.log("ℹ️  Could not auto-detect program, using OpenBook as default");
            }
        }
        
        // Load known markets from appropriate file
        loadKnownMarketsFromFile(useSerum);
        
        if (args.includes('--list') || args.includes('-l')) {
            listKnownMarkets(useSerum);
            return;
        }
        
        // Check if --add flag is present
        const shouldAdd = args.includes('--add') || args.includes('-a');
        
        // If --add flag is present and a market address is provided
        if (shouldAdd && args[0] && args[0] !== '--add' && args[0] !== '-a' && args[0] !== '--serum' && args[0] !== '-s') {
            console.log("➕ Adding market to known markets...");
            try {
                await addMarketToKnownMarkets(targetMarket, useSerum);
                
                // Save to appropriate file
                saveKnownMarketsToFile(useSerum);
                
                console.log("\n✅ Market added successfully!");
                return;
            } catch (error) {
                if (error instanceof Error && error.message === "Invalid public key format") {
                    console.error("❌ Error: Invalid public key format. Please ensure it's a valid Solana address.");
                    showUsage();
                    return;
                }
                if (error instanceof Error) {
                    console.error(`❌ Error: ${error.message}`);
                } else {
                    console.error("❌ Error: Failed to add market");
                }
                return;
            }
        }
        
        // Display market information
        try {
            // First check if the address is a valid market
            const isValid = await isValidMarket(targetMarket, useSerum);
            if (!isValid) {
                console.error("❌ Error: The provided address is not a valid market");
                console.error("   The address exists but is not owned by OpenBook or Serum programs");
                console.error("   Please provide a valid market address");
                showUsage();
                return;
            }
            
            await displayMarketInfo(targetMarket, useSerum);
            
            // Display order book
            await displayOrderBook(targetMarket, 15, useSerum);
        } catch (error) {
            if (error instanceof Error && error.message === "Invalid public key format") {
                console.error("❌ Error: Invalid public key format. Please ensure it's a valid Solana address.");
                showUsage();
                return;
            }
            throw error;
        }
        
        console.log("\n✅ Fetch completed successfully!");
        console.log("\n📝 Note: This implementation uses:");
        console.log("1. Real OpenBook market loading via Serum SDK");
        console.log("2. Direct blockchain order book fetching");
        console.log("3. Real bids and asks from the market");
        console.log("\nUsage:");

        console.log("  openbook-cli <market_address>                       # Fetch market (auto-detects program)");
        console.log("  openbook-cli <market_address> --add                 # Add market (auto-detects program)");
        console.log("  openbook-cli --list                                 # List OpenBook markets");
        console.log("  openbook-cli --list --serum                         # List Serum markets");
        console.log("\nAuto-detection:");
        console.log("  The system automatically detects if a market is OpenBook or Serum");
        console.log("  No need to specify --serum flag for most operations");
        console.log("\nFiles:");
        console.log("  Market files are stored in the CLI installation directory");
        console.log("  known_openbook_markets.json                         # OpenBook markets");
        console.log("  known_serum_markets.json                            # Serum markets");
        
    } catch (error) {
        if (error instanceof Error) {
            console.error(`❌ Error: ${error.message}`);
        } else {
            console.error("❌ Error: An unexpected error occurred");
        }
    }
}

// Export functions for use in other modules
export {
    getMarketInfo,
    getOrderBook,
    getMarketStats,
    displayOrderBook,
    displayMarketInfo,
    listKnownMarkets,
    loadOpenBookMarket,
    getRealOrderBook
};

// Export main function for CLI usage
export { main };

// Run the main function if this file is executed directly
if (require.main === module) {
    main().catch((error) => {
        console.error("❌ Error in main function:", error);
    });
}
