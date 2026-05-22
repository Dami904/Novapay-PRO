const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const NovaPay = await ethers.getContractFactory("NovaPay");
  const novapay = await NovaPay.deploy();
  await novapay.waitForDeployment();

  const address = await novapay.getAddress();
  console.log("\nNovaPay deployed to:", address);
  console.log("Explorer:", `https://explorer-hoodi.morphl2.io/address/${address}`);
  console.log("\nPaste into src/utils/contractABI.js:");
  console.log(`  export const NOVAPAY_CONTRACT_ADDRESS = '${address}'`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
