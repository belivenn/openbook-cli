import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Market } from "@project-serum/serum";

// Market information
const MARKET_ADDRESS = "Cw35vJ7ecmnwc2jPumgfhDzUuJ1fmrytuRopBF5JUXrq";

// Program IDs
const OPENBOOK_PROGRAM_ID = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
const SERUM_PROGRAM_ID = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

// Connection to Solana
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

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
        const mintPubkey = new PublicKey(mintAddress);
        
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
        console.error("Error fetching market info:", error);
        throw error;
    }
}

async function getMarketAccounts(marketAddress: string, useSerum: boolean = false) {
    try {
        const marketPubkey = new PublicKey(marketAddress);
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
        console.error("Error fetching market accounts:", error);
        throw error;
    }
}

async function loadOpenBookMarket(marketAddress: string, useSerum: boolean = false): Promise<Market> {
    try {
        const marketPubkey = new PublicKey(marketAddress);
        
        // Use the appropriate program ID based on mode
        const programId = useSerum ? SERUM_PROGRAM_ID : OPENBOOK_PROGRAM_ID;
        
        // Load the market using the appropriate program ID
        const market = await Market.load(
            connection,
            marketPubkey,
            {},
            new PublicKey(programId)
        );
        
        const programName = useSerum ? "Serum" : "OpenBook";
        console.log(`✅ ${programName} market loaded successfully!`);
        
        return market;
    } catch (error) {
        const programName = useSerum ? "Serum" : "OpenBook";
        console.error(`Error loading ${programName} market:`, error);
        throw error;
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
        console.error("❌ Error fetching real order book:", error);
        throw error;
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
        console.log("Price\t\tSize");
        console.log("-" .repeat(30));
        
        // Display asks in reverse order (highest price first)
        asks.slice().reverse().forEach((ask) => {
            console.log(`${ask.price.toFixed(4)}\t\t${ask.size.toFixed(4)}`);
        });
        
        console.log("\n🟢 BIDS (Buy Orders):");
        console.log("Price\t\tSize");
        console.log("-" .repeat(30));
        
        bids.forEach((bid) => {
            console.log(`${bid.price.toFixed(4)}\t\t${bid.size.toFixed(4)}`);
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
        console.error("Error displaying order book:", error);
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
        console.error("Error displaying market info:", error);
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
        console.log("🚀 OpenBook Order Fetcher (Real Data)");
        console.log("=" .repeat(60));
        
        // Check if a specific market address was provided
        const args = process.argv.slice(2);
        
        // Handle help flag
        if (args.includes('--help') || args.includes('-h')) {
            console.log("🚀 OpenBook CLI - Command Line Interface");
            console.log("=" .repeat(60));
            console.log("\nUsage:");
            console.log("  openbook-cli                                        # Fetch default market");
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
            return;
        }
        
        const targetMarket = args[0] || MARKET_ADDRESS;
        
        // Check for --serum flag first
        const useSerumFlag = args.includes('--serum') || args.includes('-s');
        
        // Auto-detect program type based on market ownership
        let useSerum = useSerumFlag;
        let detectedProgram = useSerumFlag ? "Serum" : "OpenBook";
        
        // If a specific market is provided, try to detect its program
        if (args[0] && !args.includes('--list') && !args.includes('-l')) {
            try {
                const marketPubkey = new PublicKey(targetMarket);
                const marketAccount = await connection.getAccountInfo(marketPubkey);
                
                if (marketAccount) {
                    const owner = marketAccount.owner.toString();
                    if (owner === SERUM_PROGRAM_ID) {
                        useSerum = true;
                        detectedProgram = "Serum";
                    } else if (owner === OPENBOOK_PROGRAM_ID) {
                        useSerum = false;
                        detectedProgram = "OpenBook";
                    }
                    console.log(`🔍 Auto-detected: ${detectedProgram} market`);
                }
            } catch (error) {
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
            await addMarketToKnownMarkets(targetMarket, useSerum);
            
            // Save to appropriate file
            saveKnownMarketsToFile(useSerum);
            
            console.log("\n✅ Market added successfully!");
            return;
        }
        
        // Display market information
        await displayMarketInfo(targetMarket, useSerum);
        
        // Display order book
        await displayOrderBook(targetMarket, 15, useSerum);
        
        console.log("\n✅ Fetch completed successfully!");
        console.log("\n📝 Note: This implementation uses:");
        console.log("1. Real OpenBook market loading via Serum SDK");
        console.log("2. Direct blockchain order book fetching");
        console.log("3. Real bids and asks from the market");
        console.log("\nUsage:");
        console.log("  openbook-cli                                        # Fetch default market");
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
        console.error("❌ Error in main function:", error);
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
