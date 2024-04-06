import { CustodyAccount } from "@/lib/CustodyAccount";
import { PositionAccount } from "@/lib/PositionAccount";
import { Position } from "@/lib/types";
import { getPerpetualProgramAndProvider } from "@/utils/constants";
import { PublicKey } from "@solana/web3.js";

interface Pending {
  status: "pending";
}

interface Failure {
  status: "failure";
  error: Error;
}

interface Success {
  status: "success";
  data: Record<string, PositionAccount>;
}

interface FetchPosition {
  account: Position;
  publicKey: PublicKey;
}

export type PositionRequest = Pending | Failure | Success;

export async function getPositionData(
  custodyInfos: Record<string, CustodyAccount>
): Promise<PositionRequest> {
  let { perpetual_program } = await getPerpetualProgramAndProvider();

  let fetchedPositions: FetchPosition[];
  try {
    // TODO: update dataSize according to `getProgramAccounts` output.
    // This is workaround for migration
    // @ts-ignore
    fetchedPositions = await perpetual_program.account.position.all([{dataSize: 232}]);
  } catch (error) {
    console.error("Error: fetchedPositions", error);
    fetchedPositions = [];
  }
  console.log("fetchedPositions", fetchedPositions);

  let positionInfos: Record<string, PositionAccount> = fetchedPositions.reduce(
    (acc: Record<string, PositionAccount>, position: FetchPosition) => (
      (acc[position.publicKey.toString()] = new PositionAccount(
        position.account,
        position.publicKey,
        custodyInfos
      )),
      acc
    ),
    {}
  );

  return {
    status: "success",
    data: positionInfos,
  };
}
