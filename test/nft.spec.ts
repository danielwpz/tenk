import {
  Runner,
  toYocto,
  createKeyPair,
  BN,
  tGas,
  NearAccount,
  Account,
} from "near-runner";
import { NEAR, Gas } from "near-units";
class ActualTestnet extends Account {
  constructor(private name: string) {
    super(null as any, null as any);
  }

  get accountId(): string {
    return this.name;
  }
}

const ONE_NFT_STORAGE_COST = "7020000000000000000000";
const ONE_NFT_STORAGE_COST_BN: NEAR = Runner.networkIsTestnet()
  ? NEAR.parse("7.18 mN")
  : NEAR.parse("7.56 mN");
const MINT_ONE_GAS = Gas.parse("300 TGas");

function costOfMinting(num: number): string {
  return ONE_NFT_STORAGE_COST_BN.mul(new BN(num)).toString();
}

/* Contract API for reference
impl Linkdrop {
  pub fn create_account(new_account_id: &str, new_public_key: &str){}
  pub fn get_key_balance(public_key: &str){}
  pub fn send(public_key: &str){}
  pub fn create_account_and_claim(new_account_id: &str, new_public_key: &str){}
  pub fn on_account_created(predecessor_account_id: &str, amount: &str){}
  pub fn on_account_created_and_claimed(amount: &str){}
  pub fn claim(account_id: &str){}
}
*/

function randomAccountId(): string {
  let accountId;
  // create random number with at least 7 digits
  const randomNumber = Math.floor(Math.random() * (9999 - 1000) + 1000);
  accountId = `${Date.now()}-${randomNumber}`;
  return accountId;
}

async function costOf(tenk: NearAccount, num: number): Promise<NEAR> {
  return NEAR.from(await tenk.view("cost_per_token", { num }));
}

// async function deployContract(account?: Account): Promise<Account> {
// return
// }

const base_cost = NEAR.parse("10 N");
const min_cost = NEAR.parse("1 N");

describe(`Running on ${Runner.getNetworkFromEnv()}`, () => {
  jest.setTimeout(2_147_483_647);
  const runner = Runner.create(async ({ root, runtime }) => {
    const network: NearAccount = Runner.networkIsTestnet()
      ? // Just need accountId "testnet"
        new ActualTestnet("testnet")
      : // Otherwise use fake linkdrop acconut on sandbox
        await root.createAndDeploy(
          "sandbox",
          `${__dirname}/../target/wasm32-unknown-unknown/release/sandbox_linkdrop.wasm`
        );

    const tenk = await root.createAndDeploy(
      "tenk",
      `${__dirname}/../target/wasm32-unknown-unknown/release/tenk.wasm`,
      {
        method: "new_default_meta",
        args: {
          owner_id: root.accountId,
          name: "meerkats",
          symbol: "N/A",
          uri: "QmaDR7ozkawfnmEirvErfcJm27FEyFv5U1KQDfWkHGj5qD",
          linkdrop_contract: network.accountId,
          size: 10000,
          base_cost,
          min_cost,
        },
        gas: tGas("20"),
      }
    );
    return { tenk, network };
  });

  test("can get cost per token", async () => {
    await runner.run(async ({ tenk }) => {
      const cost = await costOf(tenk, 1);
      expect(cost.toBigInt()).toBe(base_cost.toBigInt());
      expect(cost.gt(await costOf(tenk, 24))).toBeTruthy();
    });
  });

  test("mint one", async () => {
    await runner.run(async ({ root, tenk }) => {
      const res = await root.call(
        tenk,
        "nft_mint_one",
        {},
        {
          attachedDeposit: costOfMinting(1),
          gas: MINT_ONE_GAS,
        }
      );
      console.log(res);
    });
  });

  test("mint five", async () => {
    await runner.run(async ({ root, tenk }) => {
      const res = await root.call(
        tenk,
        "nft_mint_many",
        { num: 5 },
        {
          attachedDeposit: costOfMinting(5),
          gas: MINT_ONE_GAS,
        }
      );
      console.log(res);
    });
  });

  test("mint six", async () => {
    await expect(async () => {
      await runner.run(async ({ root, tenk }) => {
        let num = 24;
        try {
          while (true) {
            await root.call(
              tenk,
              "nft_mint_many",
              { num },
              {
                attachedDeposit: costOfMinting(num),
                gas: tGas("300"),
              }
            );
            num++;
          }
        } catch (e) {
          console.log(e);
          console.log(`Minted ${num - 1} in one transaction`);
          throw e;
        }
      });
    }).rejects.toThrow();
  });

  test("Use `create_account_and_claim` to create a new account", async () => {
    await runner.run(async ({ root, tenk, network }) => {
      // Create temporary keys for access key on linkdrop
      const senderKey = createKeyPair();
      const public_key = senderKey.getPublicKey().toString();

      // This adds the key as a function access key on `create_account_and_claim`
      await root.call(
        tenk,
        "create_linkdrop",
        {
          public_key,
        },
        {
          attachedDeposit: NEAR.parse("3 N"),
          gas: tGas("100"),
        }
      );
      // Create a random subaccount
      const new_account_id = `${randomAccountId()}.${network.accountId}`;
      const actualKey = createKeyPair();
      const new_public_key = actualKey.getPublicKey().toString();

      let res = await tenk.call(
        tenk,
        "create_account_and_claim",
        {
          new_account_id,
          new_public_key,
        },
        {
          signWithKey: senderKey,
          gas: tGas("200"),
        }
      );
      console.log(JSON.stringify(res, null, 4));

      let new_account = root.getFullAccount(new_account_id);
      if (Runner.networkIsTestnet()) {
        console.log(
          `http://explorer.testnet.near.org/accounts/${new_account.accountId}`
        );
      }
      console.log(
        `new account created: ${new_account.accountId} with balance ${
          (await new_account.balance()).available
        } yoctoNear`
      );
      res = await tenk.view("nft_tokens_for_owner", {
        account_id: new_account.accountId,
        from_index: null,
        limit: null,
      });
      console.log(JSON.stringify(res, null, 4));
    });
  });
});
