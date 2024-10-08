import { CustodyAccount } from "@/lib/CustodyAccount";
import { Custody } from "@/lib/types";
import { getPerpetualProgramAndProvider } from "@/utils/constants";
import { PublicKey } from "@solana/web3.js";

interface FetchCustody {
  account: Custody;
  publicKey: PublicKey;
}

export async function getCustodyData(): Promise<
  Record<string, CustodyAccount>
> {
  let { perpetual_program } = await getPerpetualProgramAndProvider();

  let fetchedCustodies: FetchCustody[];
  try {
    // @ts-ignore
    fetchedCustodies =
      await perpetual_program.account.custody.all();
  } catch {
    fetchedCustodies = [];
  }

  let custodyInfos: Record<string, CustodyAccount> = fetchedCustodies.reduce(
    (acc: Record<string, CustodyAccount>, { account, publicKey }) => (
      (acc[publicKey.toString()] = new CustodyAccount(account, publicKey)), acc
    ),
    {}
  );

  return custodyInfos;
}
