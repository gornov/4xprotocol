//@ts-nocheck
import { PublicKey } from "@solana/web3.js";
import { PerpetualsClient } from "./client";
import { Command } from "commander";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import BN from "bn.js";

let client: PerpetualsClient;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function initClient(clusterUrl: string, adminKeyPath: string) {
  process.env["ANCHOR_WALLET"] = adminKeyPath;
  client = new PerpetualsClient(clusterUrl, adminKeyPath);
  client.log("Client Initialized");
}

async function processLiquidations(
  poolName: string,
  tokenMint: PublicKey,
  rewardReceivingAccount: PublicKey
) {
  // read all positions
  let positions = await client.getPoolTokenPositions(poolName, tokenMint);

  let getLiquidationStateErrors = 0;
  let undercollateralized = 0;
  let liquidated = 0;
  let triggered = 0;
  let notExist = 0;

  for (const position of positions) {
    let position_side =
      JSON.stringify(position.side) === JSON.stringify({ long: {} })
        ? "long"
        : "short";

    const positionKey = client.getPositionKey(
      position.owner,
      poolName,
      tokenMint,
      position_side,
    );
    const positionInfo = await client.provider.connection.getAccountInfo(positionKey);
    const positionExists = positionInfo !== null;
    if (!positionExists) {
      notExist += 1;
    }

    let state = 0;
    if (positionExists) {
      try {
        // check position state
        state = await client.getLiquidationState(
          position.owner,
          poolName,
          tokenMint,
          position_side
        );
      } catch (err) {
        getLiquidationStateErrors += 1;
        // continue
      }
    }

    if (state === 1) {
      // liquidate over-leveraged positions
      undercollateralized += 1;

      let userTokenAccount = (
        await getOrCreateAssociatedTokenAccount(
          client.provider.connection,
          client.admin,
          tokenMint,
          position.owner
        )
      ).address;

      try {
        await client.liquidate(
          position.owner,
          poolName,
          tokenMint,
          position_side,
          userTokenAccount,
          rewardReceivingAccount
        );
        liquidated += 1;
      } catch (err) {
        // continue;
      }
    }

    const { stopLoss, takeProfit } = position;
    const isLimitOrder = stopLoss !== null || takeProfit !== null;

    let pnl: { loss: BN, profit: BN } | undefined = undefined;
    if (isLimitOrder && positionExists) {
      try {
        pnl = await client.getPnl(
          position.owner,
          poolName,
          tokenMint,
          position_side,
        );
      } catch (err) {
        // continue;
      }
    }

    if (pnl !== undefined) {
      const { loss, profit } = pnl;
      
      const lossTriggered = stopLoss !== null && loss.gte(stopLoss);
      const profitTriggered = takeProfit !== null && profit.gte(takeProfit);

      if (lossTriggered || profitTriggered) {
        try {
          let userTokenAccount = (
            await getOrCreateAssociatedTokenAccount(
              client.provider.connection,
              client.admin,
              tokenMint,
              position.owner
            )
          ).address;
          const { price, fee: _ } = await client.getExitPriceAndFee(
            position.owner,
            poolName,
            tokenMint,
            position_side,
          );
          await client.triggerPosition(
            position.owner,
            poolName,
            tokenMint,
            position_side,
            userTokenAccount,
            userTokenAccount,
            price,
          )
          triggered += 1;
        } catch (err) {
          // continue;
        }
      }
    }
  }

  return {
    undercollateralized,
    liquidated,
    total: positions.length,
    getLiquidationStateErrors,
    notExist,
    triggered,
  };
}

async function run(poolName: string, tokenMint: PublicKey) {
  let errorDelay = 10000;
  let liquidationDelay = 5000;

  let rewardReceivingAccount = (
    await getOrCreateAssociatedTokenAccount(
      client.provider.connection,
      client.admin,
      tokenMint,
      client.admin.publicKey
    )
  ).address;

  // main loop
  while (true) {
    let perpetuals;
    try {
      perpetuals = await client.getPerpetuals();
    } catch (err) {
      console.error(err);
    }

    if (!perpetuals.permissions.allowClosePosition) {
      client.error(
        `Liquidations are not allowed at this time. Retrying in ${errorDelay} sec...`
      );
      await sleep(errorDelay);
      continue;
    }

    let { undercollateralized, liquidated, total, getLiquidationStateErrors, notExist, triggered } = await processLiquidations(
      poolName,
      tokenMint,
      rewardReceivingAccount
    );
    client.log(
      `Liquidated: ${liquidated} / ${undercollateralized}. Total: ${total}, Not exist: ${notExist}, getLiquidationStateErrors: ${getLiquidationStateErrors}, triggered: ${triggered}`,
    );

    await sleep(liquidationDelay);
  }
}

(async function main() {
  const program = new Command();
  program
    .name("liquidator.ts")
    .description("Liquidator Bot for Solana Perpetuals Exchange Program")
    .version("0.1.0")
    .option(
      "-u, --url <string>",
      "URL for Solana's JSON RPC",
      "https://api.devnet.solana.com"
    )
    .requiredOption("-k, --keypair <path>", "Filepath to the admin keypair")
    .hook("preSubcommand", (thisCommand, subCommand) => {
      initClient(program.opts().url, program.opts().keypair);
      client.log(`Processing command '${thisCommand.args[0]}'`);
    })
    .hook("postAction", () => {
      client.log("Done");
    });

  program
    .command("run")
    .description("Run the bot")
    .argument("<string>", "Pool name")
    .argument("<pubkey>", "Token mint")
    .action(async (poolName, tokenMint) => {
      await run(poolName, new PublicKey(tokenMint));
    });

  await program.parseAsync(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
})();
