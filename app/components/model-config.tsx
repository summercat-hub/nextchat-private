import { ServiceProvider } from "@/app/constant";
import { ModalConfigValidator, ModelConfig } from "../store";

import Locale from "../locales";
import { ListItem, Select } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import { getModelProvider } from "../utils/model";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
}) {
  const allModels = useAllModels();
  const groupModels = groupBy(
    allModels.filter((v) => v.available),
    "provider.providerName",
  );
  const value = `${props.modelConfig.model}@${props.modelConfig?.providerName}`;

  return (
    <ListItem title={Locale.Settings.Model}>
      <Select
        aria-label={Locale.Settings.Model}
        value={value}
        align="left"
        onChange={(e) => {
          const [model, providerName] = getModelProvider(e.currentTarget.value);
          props.updateConfig((config) => {
            config.model = ModalConfigValidator.model(model);
            config.providerName = providerName as ServiceProvider;
          });
        }}
      >
        {Object.keys(groupModels).map((providerName, index) => (
          <optgroup label={providerName} key={index}>
            {groupModels[providerName].map((v, i) => (
              <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                {v.displayName}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </ListItem>
  );
}
