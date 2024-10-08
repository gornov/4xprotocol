import { CustodyAccount } from "@/lib/CustodyAccount";
import { PoolAccount } from "@/lib/PoolAccount";
import { Pool } from "@/lib/types";
import { getPerpetualProgramAndProvider } from "@/utils/constants";
import { ViewHelper } from "@/utils/viewHelpers";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

interface FetchPool {
  account: Pool;
  publicKey: PublicKey;
}

export async function getPoolData(
  custodyInfos: Record<string, CustodyAccount>
): Promise<Record<string, PoolAccount>> {
  let { perpetual_program, provider } = await getPerpetualProgramAndProvider();

  let fetchedPools: FetchPool[];
  try {
    // @ts-ignore
    fetchedPools = await perpetual_program.account.pool.all();
  } catch (error) {
    console.warn("error", error);
    fetchedPools = [];
  }
  console.log("fetchedPools", JSON.stringify(fetchedPools, null, 2));

  let poolObjs: Record<string, PoolAccount> = {};

  await Promise.all(
    Object.values(fetchedPools)
      .sort((a, b) => a.account.name.localeCompare(b.account.name))
      .map(async (pool: FetchPool) => {
        let lpTokenMint = findProgramAddressSync(
          [Buffer.from("lp_token_mint"), pool.publicKey.toBuffer()],
          perpetual_program.programId
        )[0];

        const lpData = await getMint(provider.connection, lpTokenMint);

        const View = new ViewHelper(provider.connection, provider);

        console.log("fetching pools actual data", pool);

        let poolData: Pool = {
          name: pool.account.name,
          custodies: pool.account.custodies,
          ratios: pool.account.ratios,
          aumUsd: pool.account.aumUsd,
          bump: pool.account.bump,
          lpTokenBump: pool.account.lpTokenBump,
          inceptionTime: pool.account.inceptionTime,
        };

        poolObjs[pool.publicKey.toString()] = new PoolAccount(
          poolData,
          custodyInfos,
          pool.publicKey,
          lpData
        );
        let fetchedAum;

        let loopStatus = true;

        while (loopStatus) {
          try {
            fetchedAum = await View.getAssetsUnderManagement(
              poolObjs[pool.publicKey.toString()]
            );
            loopStatus = false;
          } catch (error) {
            console.log("error", error, "getAssetsUnderManagement", pool.publicKey.toString());
          }
        }

        poolObjs[pool.publicKey.toString()].setAum(fetchedAum);
      })
  );

  return poolObjs;
}
