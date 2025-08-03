# OpenBook CLI

A comprehensive command-line interface for interacting with OpenBook and Serum DEX markets on Solana.

## 🚀 Features

- **Auto-detection**: Automatically detects OpenBook vs Serum markets
- **Real-time data**: Fetches live order book data from the blockchain
- **Market management**: Add and list known markets
- **Universal support**: Works with any market address (known or unknown)
- **Separate storage**: Maintains separate files for OpenBook and Serum markets

## 📦 Installation

```bash
npm install -g openbook-cli
```

Or install locally:

```bash
npm install openbook-cli
```

## 🎯 Quick Start

```bash
# Fetch market data (auto-detects OpenBook/Serum)
openbook-cli Gc4tfUHRNnpVwvASfQD3q26G8GNmLYuz4KzB4QNkNuiQ

# Add market to known markets
openbook-cli 8nqjw5UVN65GyfdqiXnfJNbDVBgbk8RpFFd7uACXenbx --add

# List OpenBook markets
openbook-cli --list

# List Serum markets
openbook-cli --list --serum
```

## 📋 Commands

### Fetch Market Data
```bash
openbook-cli <market_address>
```
Fetches real-time market information and order book data.

### Add Market to Known Markets
```bash
openbook-cli <market_address> --add
```
Adds a market to the persistent storage for future quick access.

### List Known Markets
```bash
# List OpenBook markets
openbook-cli --list

# List Serum markets
openbook-cli --list --serum
```

## 🔍 Auto-Detection

The CLI automatically detects whether a market belongs to OpenBook or Serum by checking the market account owner:

- **OpenBook**: `srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX`
- **Serum**: `9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin`

## 📊 Data Storage

The CLI maintains separate files for different market types:

- `known_openbook_markets.json` - OpenBook markets and token symbols
- `known_serum_markets.json` - Serum markets and token symbols

## 🎨 Token Symbol Resolution

### Known Tokens
Automatically recognizes common tokens:
- **SOL**: `So11111111111111111111111111111111111111112`
- **USDC**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **ATLAS**: `HjFijcGWKgfDwGpFX2rqFwEU9jtEgFuRQAJe1ERXFsA3`

### Unknown Tokens
For unknown tokens, the system:
1. Attempts to fetch Metaplex metadata
2. Falls back to first 8 characters of the mint address
3. Displays as: `First8Chars` (e.g., `BV1soTdX`)

## 📈 Order Book Data

The CLI fetches live order book data directly from the blockchain:
- **Bids**: Buy orders sorted by price (highest first)
- **Asks**: Sell orders sorted by price (lowest first)
- **Depth**: Configurable depth (default: 15 levels)

### Market Statistics
- **Total Bids/Asks**: Number of orders on each side
- **Best Bid/Ask**: Highest bid and lowest ask prices
- **Spread**: Difference between best ask and best bid
- **Spread %**: Spread as a percentage of best bid

## 🛠️ Development

### Prerequisites
- Node.js >= 16.0.0
- TypeScript

### Setup
```bash
git clone https://github.com/yourusername/openbook-cli.git
cd openbook-cli
npm install
```

### Build
```bash
npm run build
```

### Development
```bash
npm run dev
```

## 📝 Examples

### Basic Market Fetch
```bash
# Fetch any market (auto-detects type)
openbook-cli Gc4tfUHRNnpVwvASfQD3q26G8GNmLYuz4KzB4QNkNuiQ
```

### Add New Markets
```bash
# Add OpenBook market
openbook-cli EgnTFXgaQ8CzVSQJyTD2sT3Yx8esLgKf5e6YGvQfm2U7 --add

# Add Serum market
openbook-cli 8nqjw5UVN65GyfdqiXnfJNbDVBgbk8RpFFd7uACXenbx --add
```

### List Markets
```bash
# List OpenBook markets
openbook-cli --list

# List Serum markets
openbook-cli --list --serum
```

## 🔧 Configuration

The CLI uses the following configuration:

- **RPC Endpoint**: Default Solana RPC
- **Market Files**: Stored in the current directory
- **Token Symbols**: Cached for faster access

## 🚨 Error Handling

### Common Issues
1. **Market not found**: Invalid market address
2. **Network issues**: Connection problems to Solana RPC
3. **Token metadata unavailable**: Missing Metaplex data
4. **Program ownership mismatch**: Market belongs to different program

### Error Messages
- `❌ Market account not found` - Invalid market address
- `❌ Market verification failed` - Program ownership issue
- `No Metaplex metadata found` - Token symbol resolution failed

## 📊 Performance

### Response Times
- **Known markets**: ~2-3 seconds
- **Unknown markets**: ~3-5 seconds (includes metadata fetch)
- **Order book data**: ~1-2 seconds

### Network Usage
- Each market fetch requires multiple RPC calls
- Order book data is fetched in real-time
- Token metadata is cached after first fetch

## 🔒 Security

### Data Sources
- All data comes directly from Solana blockchain
- No third-party API dependencies
- Real-time verification of market ownership

### Market Validation
- Verifies market account exists
- Checks program ownership
- Validates token mint addresses

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/openbook-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/openbook-cli/discussions)

## 🙏 Acknowledgments

- [Serum SDK](https://github.com/project-serum/serum-ts) for market interactions
- [Solana Web3.js](https://github.com/solana-labs/solana-web3.js) for blockchain connectivity
- [OpenBook](https://openbookdex.com/) for the DEX protocol

---

Made with ❤️ for the Solana ecosystem 