import { fetchAllStats } from "@/hooks/storeHelpers/fetchPrices";
import { getAllUserData } from "@/hooks/storeHelpers/fetchUserData";
import { useGlobalStore } from "@/stores/store";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { getCustodyData } from "./storeHelpers/fetchCustodies";
import { getPoolData } from "./storeHelpers/fetchPools";
import { getPositionData } from "./storeHelpers/fetchPositions";
import { getPerpetualProgramAndProvider } from "@/utils/constants";
import { PublicKey } from "@solana/web3.js";
import { Perpetuals } from "@/target/types/perpetuals";
import { Program } from "@project-serum/anchor";

export const useHydrateStore = () => {
  const setCustodyData = useGlobalStore((state) => state.setCustodyData);
  const setPoolData = useGlobalStore((state) => state.setPoolData);
  const setPositionData = useGlobalStore((state) => state.setPositionData);

  const custodyData = useGlobalStore((state) => state.custodyData);
  const poolData = useGlobalStore((state) => state.poolData);
  const positionData = useGlobalStore((state) => state.positionData);

  const setUserData = useGlobalStore((state) => state.setUserData);
  const setPriceStats = useGlobalStore((state) => state.setPriceStats);

  const { connection } = useConnection();
  const { publicKey } = useWallet();

  useEffect(() => {
    (async () => {
      const custodyData = await getCustodyData();
      const [poolData, positionInfos] = await Promise.all([
        getPoolData(custodyData),
        getPositionData(
          custodyData,
          // publicKey || undefined,
        ),
      ]);

      console.log("poolData", poolData);

      setCustodyData(custodyData);
      setPoolData(poolData);
      setPositionData(positionInfos);
    })();
  }, []);

  // useEffect(() => {
  //   (async () => {
  //     if (publicKey) {
  //       // @ts-ignore
  //       const positionInfos = await getPositionData(custodyData, publicKey || undefined);
  //       // setPositionData(positionInfos);
  //     }
  //   })();
  // }, [publicKey, custodyData]);

  useEffect(() => {
    const rawListeners: number[] = [];
    let perpetual_program: Program<Perpetuals> | undefined = undefined;

    (async () => {
      if (positionData.status === "success") {
        perpetual_program = (await getPerpetualProgramAndProvider()).perpetual_program;

        // @ts-ignore
        const onChange = (address: PublicKey) => {
          (async () => {
            const positionInfos = await getPositionData(custodyData);
            setPositionData(positionInfos);
          })();
        };

        Object.values(positionData.data).map(pos => {
          // Raw subscribe
          const subscriptionId = perpetual_program!.provider.connection.onAccountChange(
            pos.address,
            (accountInfo, ctx) => {
              console.log("Event: onAccountChange", accountInfo, ctx);
              onChange(pos.address);
            }
          );
          rawListeners.push(subscriptionId);
          // perpetual_program!.provider.connection.removeAccountChangeListener(subscriptionId);

          // Anchor subscribe
          let emitter = perpetual_program!.account.position.subscribe(pos.address);
          if (emitter.listenerCount("change") === 0) {
            emitter.on("change", (newPosition) => {
              console.log("Event: change", pos.address.toString(), newPosition);
              onChange(pos.address);
            });
          }
          console.log('emitter.listeners("change")', emitter.listeners("change"));
        });
      }
    })();

    return () => {
      (async () => {
        rawListeners.forEach(l => {
          perpetual_program?.provider.connection.removeAccountChangeListener(l);
        });
      })();
    };
  }, [custodyData, positionData]);

  useEffect(() => {
    const interval = setInterval(() => {
      (async () => {
        try {
          const positionInfos = await getPositionData(custodyData);
          setPositionData(positionInfos);
        } catch { }
      })();
    }, 5000);

    return () => {
      clearInterval(interval);
    }
  }, [custodyData, setPositionData]);

  useEffect(() => {
    if (
      publicKey &&
      Object.values(poolData).length > 0
      // && Object.values(userData.lpBalances).length == 0
    ) {
      (async () => {
        const userData = await getAllUserData(connection, publicKey, poolData);
        setUserData(userData);
      })();
    }
  }, [publicKey, poolData]);

  useEffect(() => {
    const fetchAndSetStats = async () => {
      const priceStats = await fetchAllStats();
      setPriceStats(priceStats);
    };

    fetchAndSetStats();

    const interval = setInterval(fetchAndSetStats, 30000);

    return () => clearInterval(interval);
  }, []);
};
