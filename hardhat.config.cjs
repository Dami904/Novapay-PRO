require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL     = process.env.MORPH_HOODI_RPC || "https://rpc-hoodi.morphl2.io";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    morphHoodi: {
      url:      RPC_URL,
      chainId:  2910,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
