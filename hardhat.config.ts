/**
 * @type import('hardhat/config').HardhatUserConfig
 */
 import { HardhatUserConfig } from "hardhat/types";
 import '@openzeppelin/hardhat-upgrades';
 
 import "@nomiclabs/hardhat-waffle";
 import "@nomiclabs/hardhat-etherscan";
 import "hardhat-typechain";
 import fs from "fs";
 import path from "path";
 import dotenv from 'dotenv';

 dotenv.config();

 const USER_HOME = process.env.HOME || process.env.USERPROFILE
 let data = {
  "PrivateKey": "",
  "InfuraApiKey": "",
  "EtherscanApiKey": "",
  "ArbitrumscanApiKey": "",
  "MaticscanApiKey": "",
  "BscscanApiKey": "",
  "opencampusApiKey": "",
};
 
 let filePath = path.join(USER_HOME+'/.hardhat.data.json');
 if (fs.existsSync(filePath)) {
   let rawdata = fs.readFileSync(filePath);
   data = JSON.parse(rawdata.toString());
 }
 filePath = path.join(__dirname, `.hardhat.data.json`);
 if (fs.existsSync(filePath)) {
   let rawdata = fs.readFileSync(filePath);
   data = JSON.parse(rawdata.toString());
 }
 
 const LOWEST_OPTIMIZER_COMPILER_SETTINGS = {
   version: "0.8.11",
   settings: {
     optimizer: {
       enabled: true,
       runs: 200,
     },
     metadata: {
       bytecodeHash: 'none',
     },
   },
 }
 
 const LOWER_OPTIMIZER_COMPILER_SETTINGS = {
   version: "0.8.11",
   settings: {
     optimizer: {
       enabled: true,
       runs: 10_000,
     },
   },
 }
 
 const DEFAULT_COMPILER_SETTINGS = {
   version: "0.8.11",
   settings: {
     optimizer: {
       enabled: true,
       runs: 1_000_000,
     }
   },
 }
 
 const config: HardhatUserConfig = {
   defaultNetwork: "hardhat",
   solidity: {
     compilers: [DEFAULT_COMPILER_SETTINGS],
     overrides: {
       'contracts/Payment.sol': LOWER_OPTIMIZER_COMPILER_SETTINGS,
     },
   },
   networks: {
     hardhat: {},
     mainnet: {
       url: `https://mainnet.infura.io/v3/${data.InfuraApiKey}`,
       accounts: [data.PrivateKey]
     },
     goerli: {
       url: `https://goerli.infura.io/v3/${data.InfuraApiKey}`,
       accounts: [data.PrivateKey]
     },
     sepolia: {
       url: `https://sepolia.infura.io/v3/${data.InfuraApiKey}`,
       accounts: [data.PrivateKey]
     },
     bsctestnet: {
       url: `https://bsc-testnet.publicnode.com`,
       accounts: [data.PrivateKey]
     },
     bscmainnet: {
       url: `https://bsc-dataseed.binance.org/`,
       accounts: [data.PrivateKey]
     },
     opbnbtestnet: {
      url: `https://opbnb-testnet-rpc.bnbchain.org`,
      accounts: [data.PrivateKey]
    },
     opbnbmainnet: {
      url: `https://opbnb-mainnet-rpc.bnbchain.org`,
      accounts: [data.PrivateKey]
    },
     arbitrum_goerli: {
       url: `https://arbitrum-goerli.infura.io/v3/${data.InfuraApiKey}`,
       accounts: [data.PrivateKey],
       gas: "auto",
     },
     arbitrum: {
       url: `https://arbitrum-mainnet.infura.io/v3/${data.InfuraApiKey}`,
       accounts: [data.PrivateKey],
     },
     mantatestnet: {
      url: `https://pacific-rpc.testnet.manta.network/http`,
      accounts: [data.PrivateKey]
    },
     mantamainnet: {
      url: `https://pacific-rpc.manta.network/http`,
      accounts: [data.PrivateKey]
    },
    opencampus_sepolia: {
      url: `https://open-campus-codex-sepolia.drpc.org`,
      accounts: [data.PrivateKey]
    },
    opencampus: {
      url: `https://rpc.edu-chain.raas.gelato.cloud`,
      accounts: [data.PrivateKey]
    },
   },
   etherscan: {
    apiKey: {
      mainnet: data.EtherscanApiKey,
      goerli: data.EtherscanApiKey,
      sepolia: data.EtherscanApiKey,
      arbitrumOne: data.ArbitrumscanApiKey,
      polygon: data.MaticscanApiKey,
      bsc: data.BscscanApiKey,
      bscTestnet: data.BscscanApiKey,
      opencampus_sepolia: data.opencampusApiKey,
      opencampus: data.opencampusApiKey,
    },
    customChains: [
      {
        network: "opencampus_sepolia",
        chainId: 656476,
        urls: {
          apiURL: "https://edu-chain-testnet.blockscout.com/api",
          browserURL: "https://edu-chain-testnet.blockscout.com"
        }
      },
      {
        network: "opencampus",
        chainId: 41923,
        urls: {
          apiURL: "https://educhain.blockscout.com/api",
          browserURL: "https://educhain.blockscout.com"
        }
      }
    ]
   },
   paths: {
     sources: "./contracts",
     tests: "./test",
     cache: "./cache",
     artifacts: "./artifacts"
   },
   mocha: {
     timeout: 100000
   }
 };
 
 export default config;