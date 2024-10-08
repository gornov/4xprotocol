//@ts-nocheck
import {
  setProvider,
  Program,
  AnchorProvider,
  workspace,
  utils,
  BN,
  web3 as anchorWeb3,
} from "@project-serum/anchor";
import { Perpetuals } from "../../target/types/perpetuals";
import {
  PublicKey,
  TransactionInstruction,
  Transaction,
  SystemProgram,
  AccountMeta,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import JSBI from "jsbi";
import fetch from "node-fetch";
import { sha256 } from "js-sha256";
import { readFileSync } from "fs";
import { resolveOrCreateAssociatedTokenAddress } from "@orca-so/sdk";

export const log = (message: string) => {
  const date = new Date();
  const date_str = date.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour12: false });
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  console.log(`[${date_str} ${time}.${ms}] ${message}`);
};

export type PositionSide = "long" | "short";

export class PerpetualsClient {
  provider: AnchorProvider;
  program: Program<Perpetuals>;
  admin: Keypair;

  // pdas
  multisig: { publicKey: PublicKey; bump: number };
  authority: { publicKey: PublicKey; bump: number };
  perpetuals: { publicKey: PublicKey; bump: number };

  constructor(clusterUrl: string, adminKey: string) {
    this.provider = AnchorProvider.local(clusterUrl, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    setProvider(this.provider);
    this.program = workspace.Perpetuals as Program<Perpetuals>;

    this.admin = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(readFileSync(adminKey).toString()))
    );

    this.multisig = this.findProgramAddress("multisig");
    this.authority = this.findProgramAddress("transfer_authority");
    this.perpetuals = this.findProgramAddress("perpetuals");

    BN.prototype.toJSON = function () {
      return this.toString(10);
    };
  }

  findProgramAddress = (label: string, extraSeeds = null) => {
    let seeds = [Buffer.from(utils.bytes.utf8.encode(label))];
    if (extraSeeds) {
      for (let extraSeed of extraSeeds) {
        if (typeof extraSeed === "string") {
          seeds.push(Buffer.from(utils.bytes.utf8.encode(extraSeed)));
        } else if (Array.isArray(extraSeed)) {
          seeds.push(Buffer.from(extraSeed));
        } else {
          seeds.push(extraSeed.toBuffer());
        }
      }
    }
    let res = PublicKey.findProgramAddressSync(seeds, this.program.programId);
    return { publicKey: res[0], bump: res[1] };
  };

  adjustTokenRatios = (ratios) => {
    if (ratios.length == 0) {
      return ratios;
    }
    let target = Math.floor(10000 / ratios.length);

    for (let ratio of ratios) {
      ratio.target = new BN(target);
    }

    if (10000 % ratios.length !== 0) {
      ratios[ratios.length - 1].target = new BN(
        target + (10000 % ratios.length)
      );
    }

    return ratios;
  };

  getPerpetuals = async () => {
    return this.program.account.perpetuals.fetch(this.perpetuals.publicKey);
  };

  getPoolKey = (name: string) => {
    return this.findProgramAddress("pool", name).publicKey;
  };

  getPool = async (name: string) => {
    return this.program.account.pool.fetch(this.getPoolKey(name));
  };

  getPools = async () => {
    //return this.program.account.pool.all();
    let perpetuals = await this.getPerpetuals();
    return this.program.account.pool.fetchMultiple(perpetuals.pools);
  };

  getPoolLpTokenKey = (name: string) => {
    return this.findProgramAddress("lp_token_mint", [this.getPoolKey(name)])
      .publicKey;
  };

  getCustodyKey = (poolName: string, tokenMint: PublicKey) => {
    if (typeof poolName !== "string") {
      throw Error(`Wrong type ${typeof poolName}`);
    }
    if (!(tokenMint instanceof PublicKey)) {
      throw Error(`Wrong type ${tokenMint}`);
    }
    const poolKey = this.getPoolKey(poolName);
    return this.findProgramAddress("custody", [
      poolKey,
      tokenMint,
    ]).publicKey;
  };

  getCustodyTokenAccountKey = (poolName: string, tokenMint: PublicKey) => {
    return this.findProgramAddress("custody_token_account", [
      this.getPoolKey(poolName),
      tokenMint,
    ]).publicKey;
  };

  getCustodyOracleAccountKey = async (
    poolName: string,
    tokenMint: PublicKey
  ) => {
    return (await this.getCustody(poolName, tokenMint)).oracle.oracleAccount;
  };

  getCustodyTestOracleAccountKey = (poolName: string, tokenMint: PublicKey) => {
    return this.findProgramAddress("oracle_account", [
      this.getPoolKey(poolName),
      tokenMint,
    ]).publicKey;
  };

  getCustody = async (poolName: string, tokenMint: PublicKey) => {
    return this.program.account.custody.fetch(
      this.getCustodyKey(poolName, tokenMint)
    );
  };

  getCustodies = async (poolName: string) => {
    //return this.program.account.custody.all();
    let pool = await this.getPool(poolName);
    return this.program.account.custody.fetchMultiple(pool.custodies);
  };

  getCustodyMetas = async (poolName: string) => {
    let pool = await this.getPool(poolName);
    let custodies = await this.program.account.custody.fetchMultiple(pool.custodies);
    let custodyMetas = [];
    for (const custody of pool.custodies) {
      custodyMetas.push({
        isSigner: false,
        isWritable: false,
        pubkey: custody,
      });
    }
    for (const custody of custodies) {
      custodyMetas.push({
        isSigner: false,
        isWritable: false,
        pubkey: custody.oracle.oracleAccount,
      });
    }
    return custodyMetas;
  };

  getMultisig = async () => {
    return this.program.account.multisig.fetch(this.multisig.publicKey);
  };

  getPositionKey = (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide
  ) => {
    let pool = this.getPoolKey(poolName);
    let custody = this.getCustodyKey(poolName, tokenMint);
    return this.findProgramAddress("position", [
      wallet,
      pool,
      custody,
      side === "long" ? [1] : [2],
    ]).publicKey;
  };

  getUserPosition = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide
  ) => {
    return this.program.account.position.fetch(
      this.getPositionKey(wallet, poolName, tokenMint, side)
    );
  };

  getUserPositions = async (wallet: PublicKey) => {
    let data = utils.bytes.bs58.encode(
      Buffer.concat([
        this.getAccountDiscriminator("Position"),
        wallet.toBuffer(),
      ])
    );
    let positions = await this.provider.connection.getProgramAccounts(
      this.program.programId,
      {
        filters: [{ dataSize: 232 }, { memcmp: { bytes: data, offset: 0 } }],
      }
    );
    return Promise.all(
      positions.map(async (position) => {
        let account = await this.program.account.position.fetch(position.pubkey);
        console.log("account", JSON.stringify({ account, pubkey: position.pubkey }, null, 2));

        const check_correctness = false;

        if (check_correctness) {

          // 1
          let position_side =
            JSON.stringify(account.side) === JSON.stringify({ long: {} })
              ? "long"
              : "short";
          let out1 = this.findProgramAddress("position", [
            account.owner,
            account.pool,
            account.custody,
            position_side === "long" ? [1] : [2],
          ]);

          // 2
          const label = "position";
          const extraSeeds = [
            account.owner,
            account.pool,
            account.custody,
            position_side === "long" ? [1] : [2],
          ];
          let seeds = [Buffer.from(utils.bytes.utf8.encode(label))];
          if (extraSeeds) {
            for (let extraSeed of extraSeeds) {
              if (typeof extraSeed === "string") {
                seeds.push(Buffer.from(utils.bytes.utf8.encode(extraSeed)));
              } else if (Array.isArray(extraSeed)) {
                seeds.push(Buffer.from(extraSeed));
              } else {
                seeds.push(extraSeed.toBuffer());
              }
            }
          }
          let res2 = PublicKey.findProgramAddressSync(seeds, this.program.programId);
          let out2 = { publicKey: res2[0], bump: res2[1] };

          // 3
          let res3 = this.findProgramAddress("position", [
            new PublicKey("J9UQ5fP2g3kv5kWAV5A1wBJav16eFgvQUqzadBcz3MNu"),
            new PublicKey("2raPSEshuG4Ke8Q6XufNG7aLG9PhX2TonPjgfze2zCgd"),
            new PublicKey("Gy858NJNiwHX3aR9ZEUKgDLfdGifSBgcwSzwGPusBPNn"),
            [0],
          ]);
          let out3 = { publicKey: res3[0], bump: res3[1] };


          if (JSON.stringify(out1) !== JSON.stringify(out2) && JSON.stringify(out2) !== JSON.stringify(out3)) {
            throw Error(`Check failed: ${out1}, ${out2}`);
          }

          const createOut1 = PublicKey.createProgramAddressSync([...seeds, Buffer.from([out2.bump])], this.program.programId);
          console.log("createOut1", createOut1.toString());

          // const createOut2 = PublicKey.createProgramAddressSync([...seeds, Buffer.from([account.bump])], this.program.programId);
          // console.log("createOut2", createOut2.toString());

          if (position.pubkey.toString() !== out1.publicKey.toString()) {
            throw Error(`Wrong ID: ${position.pubkey.toString()}, ${out1.publicKey.toString()}, ${JSON.stringify(out1, null, 2)}`);
          }

          console.log("________________________");
        }

        return {
          publicKey: position.pubkey,
          account,
        };
      })
    );
  };

  getPoolTokenPositions = async (poolName: string, tokenMint: PublicKey) => {
    let poolKey = this.getPoolKey(poolName);
    let custodyKey = this.getCustodyKey(poolName, tokenMint);
    let data = utils.bytes.bs58.encode(
      Buffer.concat([poolKey.toBuffer(), custodyKey.toBuffer()])
    );
    let positions = await this.provider.connection.getProgramAccounts(
      this.program.programId,
      {
        filters: [{ dataSize: 232 }, { memcmp: { bytes: data, offset: 40 } }],
      }
    );
    return Promise.all(
      positions.map((position) => {
        return this.program.account.position.fetch(position.pubkey);
      })
    );
  };

  getAllPositions = async () => {
    const rawAccounts = await this.provider.connection.getProgramAccounts(
      this.program.programId,
      {
        encoding: "base64",
        filters: [
          { memcmp: { offset: 0, bytes: "VZMoMoKgZQb" } },
        ],
      },
    );
    // console.log("rawAccounts", rawAccounts);
    console.log("rawAccounts", rawAccounts.map(a => a.pubkey.toString()));
    // console.log(
    //   "rawAccounts",
    //   rawAccounts.map(a => a.account.data.subarray(0, 8).toString('hex')).sort((a, b) => a > b ? 1 : (a < b) ? -1 : 0),
    // );
    return this.program.account.position.all();
  };

  getAccountDiscriminator = (name: string) => {
    return Buffer.from(sha256.digest(`account:${name}`)).slice(0, 8);
  };

  log = (message: string) => {
    log(message);
  };

  prettyPrint = (object: object) => {
    console.log(JSON.stringify(object, null, 2));
  };

  ///////
  // instructions

  init = async (admins: Publickey[], config) => {
    let perpetualsProgramData = PublicKey.findProgramAddressSync(
      [this.program.programId.toBuffer()],
      new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    )[0];

    let adminMetas = [];
    for (const admin of admins) {
      adminMetas.push({
        isSigner: false,
        isWritable: false,
        pubkey: admin,
      });
    }

    await this.program.methods
      .init(config)
      .accounts({
        upgradeAuthority: this.provider.wallet.publicKey,
        multisig: this.multisig.publicKey,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        perpetualsProgram: this.program.programId,
        perpetualsProgramData,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(adminMetas)
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  setAdminSigners = async (admins: Publickey[], minSignatures: number) => {
    let adminMetas = [];
    for (const admin of admins) {
      adminMetas.push({
        isSigner: false,
        isWritable: false,
        pubkey: admin,
      });
    }
    try {
      await this.program.methods
        .setAdminSigners({
          minSignatures,
        })
        .accounts({
          admin: this.admin.publicKey,
          multisig: this.multisig.publicKey,
        })
        .remainingAccounts(adminMetas)
        .signers([this.admin])
        .rpc();
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  addPool = async (name: string) => {
    await this.program.methods
      .addPool({ name })
      .accounts({
        admin: this.admin.publicKey,
        multisig: this.multisig.publicKey,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(name),
        lpTokenMint: this.getPoolLpTokenKey(name),
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  removePool = async (name: string) => {
    await this.program.methods
      .removePool({})
      .accounts({
        admin: this.admin.publicKey,
        multisig: this.multisig.publicKey,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(name),
        systemProgram: SystemProgram.programId,
      })
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  addCustody = async (
    poolName: string,
    tokenMint: PublicKey,
    isStable: boolean,
    oracleConfig,
    pricingConfig,
    permissions,
    fees,
    borrowRate,
    ratios,
  ) => {
    await this.program.methods
      .addCustody({
        isStable,
        oracle: oracleConfig,
        pricing: pricingConfig,
        permissions,
        fees,
        borrowRate,
        ratios,
      })
      .accounts({
        admin: this.admin.publicKey,
        multisig: this.multisig.publicKey,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyTokenAccount: this.getCustodyTokenAccountKey(
          poolName,
          tokenMint
        ),
        custodyTokenMint: tokenMint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  setCustodyConfig = async (
    poolName: string,
    tokenMint: PublicKey,
    isStable: boolean,
    oracleConfig,
    pricingConfig,
    permissions,
    fees,
    borrowRate,
    ratios,
  ) => {
    await this.program.methods
      .setCustodyConfig({
        isStable,
        oracle: oracleConfig,
        pricing: pricingConfig,
        permissions,
        fees,
        borrowRate,
        ratios,
      })
      .accounts({
        admin: this.admin.publicKey,
        multisig: this.multisig.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
      })
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  removeCustody = async (poolName: string, tokenMint: PublicKey, ratios) => {
    await this.program.methods
      .removeCustody({ ratios })
      .accounts({
        admin: this.admin.publicKey,
        multisig: this.multisig.publicKey,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyTokenAccount: this.getCustodyTokenAccountKey(
          poolName,
          tokenMint
        ),
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  upgradeCustody = async (poolName: string, tokenMint: PublicKey) => {
    await this.program.methods
      .upgradeCustody({})
      .accounts({
        admin: this.admin.publicKey,
        multisig: this.multisig.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        systemProgram: SystemProgram.programId,
      })
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  upgradePosition = async (poolName: string, position: PublicKey) => {
    console.log("position", position.toString());
    await this.program.methods
      .upgradePosition({})
      .accounts({
        admin: this.admin.publicKey,
        multisig: this.multisig.publicKey,
        pool: this.getPoolKey(poolName),
        position,
        systemProgram: SystemProgram.programId,
      })
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  addLiquidity = async (
    amountIn: BN,
    minLpAmountOut: BN,
    fundingAccount: PublicKey,
    lpTokenAccount: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
  ) => {
    const modifyComputeUnits = anchorWeb3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });
    await this.program.methods
      .addLiquidity({
        amountIn,
        minLpAmountOut,
      })
      .accounts({
        owner: this.admin.publicKey,
        fundingAccount,
        lpTokenAccount,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
        custodyTokenAccount: this.getCustodyTokenAccountKey(
          poolName,
          tokenMint
        ),
        lpTokenMint: this.getPoolLpTokenKey(poolName),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([modifyComputeUnits])
      .remainingAccounts(await this.getCustodyMetas(poolName))
      .signers([this.admin])
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  liquidate = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide,
    receivingAccount: PublicKey,
    rewardsReceivingAccount: PublicKey
  ) => {
    return await this.program.methods
      .liquidate({})
      .accounts({
        signer: this.provider.wallet.publicKey,
        receivingAccount,
        rewardsReceivingAccount,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        position: this.getPositionKey(wallet, poolName, tokenMint, side),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
        custodyTokenAccount: this.getCustodyTokenAccountKey(
          poolName,
          tokenMint
        ),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  triggerPosition = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide,
    receivingAccount: PublicKey,
    rewardsReceivingAccount: PublicKey,
    price: BN,
  ) => {
    return await this.program.methods
      .triggerPosition({ price })
      .accounts({
        signer: this.provider.wallet.publicKey,
        receivingAccount,
        // rewardsReceivingAccount,
        transferAuthority: this.authority.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        position: this.getPositionKey(wallet, poolName, tokenMint, side),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
        custodyTokenAccount: this.getCustodyTokenAccountKey(
          poolName,
          tokenMint
        ),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  updatePositionLimits = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide,
    stopLoss: BN | null,
    takeProfit: BN | null,
  ) => {
    console.log(JSON.stringify({ stopLoss, takeProfit }));
    console.log(JSON.stringify({
      owner: this.provider.wallet.publicKey,
      perpetuals: this.perpetuals.publicKey,
      pool: this.getPoolKey(poolName),
      position: this.getPositionKey(wallet, poolName, tokenMint, side),
      custody: this.getCustodyKey(poolName, tokenMint),
    }, null, 2));

    return await this.program.methods
      .updatePositionLimits({ stopLoss, takeProfit })
      .accounts({
        owner: this.provider.wallet.publicKey,
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        position: this.getPositionKey(wallet, poolName, tokenMint, side),
        custody: this.getCustodyKey(poolName, tokenMint),
      })
      .rpc()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getOraclePrice = async (
    poolName: string,
    tokenMint: PublicKey,
    ema: boolean
  ) => {
    return await this.program.methods
      .getOraclePrice({
        ema,
      })
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
      })
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getAddLiquidityAmountAndFee = async (
    poolName: string,
    tokenMint: PublicKey,
    amount: BN
  ) => {
    return await this.program.methods
      .getAddLiquidityAmountAndFee({
        amountIn: amount,
      })
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
        lpTokenMint: this.getPoolLpTokenKey(poolName),
      })
      .remainingAccounts(await this.getCustodyMetas(poolName))
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getRemoveLiquidityAmountAndFee = async (
    poolName: string,
    tokenMint: PublicKey,
    lpAmount: BN
  ) => {
    return await this.program.methods
      .getRemoveLiquidityAmountAndFee({
        lpAmountIn: lpAmount,
      })
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
        lpTokenMint: this.getPoolLpTokenKey(poolName),
      })
      .remainingAccounts(await this.getCustodyMetas(poolName))
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getEntryPriceAndFee = async (
    poolName: string,
    tokenMint: PublicKey,
    collateral: BN,
    size: BN,
    side: PositionSide
  ) => {
    return await this.program.methods
      .getEntryPriceAndFee({
        collateral,
        size,
        side: side === "long" ? { long: {} } : { short: {} },
      })
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
      })
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getExitPriceAndFee = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide
  ) => {
    return await this.program.methods
      .getExitPriceAndFee({})
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        position: this.getPositionKey(wallet, poolName, tokenMint, side),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
      })
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getLiquidationPrice = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide,
    addCollateral: BN,
    removeCollateral: BN
  ) => {
    return await this.program.methods
      .getLiquidationPrice({
        addCollateral,
        removeCollateral,
      })
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        position: this.getPositionKey(wallet, poolName, tokenMint, side),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
      })
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getLiquidationState = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide
  ) => {
    return await this.program.methods
      .getLiquidationState({})
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        position: this.getPositionKey(wallet, poolName, tokenMint, side),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
      })
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getPnl = async (
    wallet: PublicKey,
    poolName: string,
    tokenMint: PublicKey,
    side: PositionSide
  ) => {
    return await this.program.methods
      .getPnl({})
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        position: this.getPositionKey(wallet, poolName, tokenMint, side),
        custody: this.getCustodyKey(poolName, tokenMint),
        custodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMint
        ),
      })
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getSwapAmountAndFees = async (
    poolName: string,
    tokenMintIn: PublicKey,
    tokenMintOut: PublicKey,
    amountIn: BN
  ) => {
    return await this.program.methods
      .getSwapAmountAndFees({
        amountIn,
      })
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
        receivingCustody: this.getCustodyKey(poolName, tokenMintIn),
        receivingCustodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMintIn
        ),
        dispensingCustody: this.getCustodyKey(poolName, tokenMintOut),
        dispensingCustodyOracleAccount: await this.getCustodyOracleAccountKey(
          poolName,
          tokenMintOut
        ),
      })
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };

  getAum = async (poolName: string) => {
    return await this.program.methods
      .getAssetsUnderManagement({})
      .accounts({
        perpetuals: this.perpetuals.publicKey,
        pool: this.getPoolKey(poolName),
      })
      .remainingAccounts(await this.getCustodyMetas(poolName))
      .view()
      .catch((err) => {
        console.error(err);
        throw err;
      });
  };
}
