const { keyStores, connect, Contract } = require("near-api-js");
const fs = require("fs");
const path = require("path");
const homedir = require("os").homedir();

const CREDENTIALS_DIR = ".near-credentials";
const ACCOUNT_ID = "tenk1.neariscool.testnet";
const WASM_PATH = "./res/tenk.wasm";
const credentialsPath = path.join(homedir, CREDENTIALS_DIR);
const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsPath);

const config = {
  keyStore,
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
};

async function deployAndInitContract(accountId, wasmPath) {
  const near = await connect(config);
  const account = await near.account(accountId);
  const result = await account.deployContract(fs.readFileSync(wasmPath));
  console.log(result);
  console.log(`Deployed to ${accountId}`);

  const contract = new Contract(
    account,
    accountId,
    {
      changeMethods: ['new', 'new_default_meta']
    }
  );

  await contract.new_default_meta({
    args: {
      owner_id: accountId,
      name: '秃力富',
      symbol: 'HHS',
      uri: 'https://test.com/',
      unit_price: 1
    }
  })
}

deployContract(ACCOUNT_ID, WASM_PATH)
  .catch(err => {
    console.log(err);
    process.exit(1);
  })
  .then(() => {
    process.exit();
  });
