const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const PayFlow = await ethers.getContractFactory("PayFlow");
  const payflow = await PayFlow.deploy();
  await payflow.waitForDeployment();

  const address = await payflow.getAddress();
  console.log("\nPayFlow deployed to:", address);
  console.log("Explorer:", `https://explorer-hoodi.morphl2.io/address/${address}`);
  console.log("\nPaste into src/utils/contractABI.js:");
  console.log(`  export const NOVAPAY_CONTRACT_ADDRESS = '${address}'`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
