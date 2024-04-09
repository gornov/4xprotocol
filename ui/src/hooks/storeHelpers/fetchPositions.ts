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
  custodyInfos: Record<string, CustodyAccount>,
  userPubkey?: PublicKey,
): Promise<PositionRequest> {
  let { perpetual_program } = await getPerpetualProgramAndProvider();

  let fetchedPositions: FetchPosition[];
  try {
    // TODO: update dataSize according to `getProgramAccounts` output.
    // This is workaround for migration
    // @ts-ignore
    fetchedPositions = await perpetual_program.account.position.all([{ dataSize: 232 }]);
  } catch (error) {
    console.error("Error: fetchedPositions", error);
    fetchedPositions = [];
  }
  console.log("fetchedPositions", fetchedPositions);

  (async () => {
    try {
      const allRawPositions = await perpetual_program.account.position.all();
      console.info("allRawPositions", allRawPositions);

      // Filter positions by user address
      console.log("userPubkey", userPubkey?.toString());
      if (userPubkey !== undefined) {
        const filteredPositions = await perpetual_program.account.position.all([
          { dataSize: 232 },
          { memcmp: { offset: 8, bytes: userPubkey.toString() } }
        ]);
        console.info("filteredPositions", filteredPositions);
      }
    } catch {
      console.error("Some positions can't be deserialized");
    }
  })();

  fetchedPositions.map(pos => {
    // Raw subscribe
    perpetual_program.provider.connection.onAccountChange(
      pos.publicKey,
      (accountInfo, ctx) => {
        console.log("Event: onAccountChange", accountInfo, ctx);
      }
    )

    // Anchor subscribe
    let emitter = perpetual_program.account.position.subscribe(pos.publicKey);
    emitter.on("change", (newPosition) => {
      console.log("Event: change", pos.publicKey.toString(), newPosition);
    });
  });

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
