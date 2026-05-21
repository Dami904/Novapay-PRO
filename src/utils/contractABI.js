// Replace NOVAPAY_CONTRACT_ADDRESS with your deployed NovaPay contract address on Morph
// Replace USDC_CONTRACT_ADDRESS with the USDC token address on Morph testnet
export const NOVAPAY_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000'
export const USDC_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001'

export const MORPH_TESTNET = {
  chainId: '0xB5E', // 2910
  chainName: 'Morph Hoodi',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc-hoodi.morphl2.io'],
  blockExplorerUrls: ['https://explorer-hoodi.morphl2.io'],
}

export const NOVAPAY_ABI = [
  {
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'label', type: 'string' },
    ],
    name: 'batchPayout',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'label', type: 'string' },
      { indexed: false, name: 'recipientCount', type: 'uint256' },
      { indexed: false, name: 'totalAmount', type: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
    ],
    name: 'PayrollBatch',
    type: 'event',
  },
]

export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
]
