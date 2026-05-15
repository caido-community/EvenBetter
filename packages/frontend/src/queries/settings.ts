import { useQuery } from "@pinia/colada";
import { type SettingKey, type Settings, type SettingValue } from "shared";
import { computed, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

const SETTINGS_KEY = ["settings"] as const;

export const useSettingsQuery = () => {
  const sdk = useSDK();

  return useQuery<Settings>({
    key: SETTINGS_KEY,
    query: async () => {
      const res = await sdk.backend.getSettings();
      if (res.kind === "Error") {
        throw new Error(res.error);
      }
      return res.value;
    },
  });
};

export const useUpdateSetting = () => {
  const sdk = useSDK();
  const { refetch } = useSettingsQuery();
  const isPending = ref(false);

  const updateSetting = async <K extends SettingKey>(payload: {
    key: K;
    value: SettingValue<K>;
  }) => {
    isPending.value = true;
    const res = await sdk.backend.updateSetting(payload.key, payload.value);
    if (res.kind === "Error") {
      isPending.value = false;
      throw new Error(res.error);
    }
    await refetch();
    isPending.value = false;
  };

  return {
    updateSetting,
    isPending: computed(() => isPending.value),
  };
};
