import path from "path";
import { Runner, tGas } from "near-runner";

describe("NFT Tenk", () => {
  jest.setTimeout(60_000);

  const runner = Runner.create(async ({ root }) => {
    const alice = await root.createAccount("alice");
    const contract = await root.createAndDeploy(
      "tenk-nft",
      path.join(__dirname, "..", "res", "tenk.wasm")
    );
    return { alice, contract };
  });

  test.concurrent('Mint', async () => {
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
        console.log(nft.token_id);
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

    });
  });
});
