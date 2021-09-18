import path from "path";
import { Runner, tGas } from "near-runner";

describe("NFT Tenk", () => {
  jest.setTimeout(60_000);

  const runner = Runner.create(async ({ root }) => {
    const alice = await root.createAccount('alice');
    const bob = await root.createAccount('bob');
    const contract = await root.createAndDeploy(
      "tenk-nft",
      path.join(__dirname, "..", "res", "tenk.wasm")
    );
    return { alice, bob, contract };
  });

  test.concurrent('Mint by Owner', async () => {
    const r = await runner;
    await r.run(async ({ alice, contract }) => {
      await alice.call(
        contract,
        'new_default_meta',
        {
          owner_id: alice.accountId,
          name: 'foo nft',
          symbol: 'FOO',
          uri: 'https://nft.com',
          unit_price: '10',
          linkdrop_contract: ''
        }
      );

      const contractMeta = await contract.view('nft_metadata');
      expect(contractMeta.spec).toBe('nft-1.0.0');
      expect(contractMeta.name).toBe('foo nft');
      expect(contractMeta.symbol).toBe('FOO');

      // mint first 5
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const nft = await alice.call(
          contract,
          'nft_mint',
          {},
          {
            gas: tGas('20'),
            attachedDeposit: '7020000000000000000000'
          }
        );
        expect(nft.token_id).toBeTruthy();
        expect(nft.owner_id).toBe(alice.accountId);
        expect(ids).not.toContain(nft.token_id);

        ids.push(nft.token_id);
      }

      // try mint one more
      let throwed = false;
      try {
        await alice.call(
          contract,
          'nft_mint',
          {},
          {
            gas: tGas('20'),
            attachedDeposit: '7020000000000000000000'
          }
        );
      } catch (err) {
        throwed = true;
      }
      expect(throwed).toBeTruthy();

      // enum
      const tokens = await alice.call(
        contract,
        'nft_tokens_for_owner',
        {
          account_id: alice.accountId
        }
      );
      expect(tokens.length).toBe(5);

    });
  });

  test.concurrent('Mint by Other', async () => {
    const r = await runner;
    await r.run(async (context) => {
      const { alice, bob, contract } = context;
      await alice.call(
        contract,
        'new_default_meta',
        {
          owner_id: alice.accountId,
          name: 'foo nft',
          symbol: 'FOO',
          uri: 'https://nft.com',
          unit_price: '10',
          linkdrop_contract: ''
        }
      );

      const nft = await bob.call(
        contract,
        'nft_mint',
        {},
        {
          gas: tGas('20'),
          attachedDeposit: '10000000000000000000000000'
        }
      )
      expect(nft.token_id).toBeTruthy();
      expect(nft.owner_id).toBe(bob.accountId);

      // no enough deposit
      let throwed = false;
      try {
        await bob.call(
          contract,
          'nft_mint',
          {},
          {
            gas: tGas('20'),
            attachedDeposit: '9000000000000000000000000'
          }
        );
      } catch (err) {
        throwed = true;
        console.log(err);
      }
      expect(throwed).toBeTruthy();

    });
  })

});
