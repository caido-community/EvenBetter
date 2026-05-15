import { createFeature } from "@/features/manager";
import { type FrontendSDK } from "@/types";

const excludeHostPathFunctionality = (sdk: FrontendSDK) => {
  sdk.commands.register("eb:excludehost", {
    name: "Exclude Host",
    run: async () => {
      const selectedRequest = await getSelectedRequest(sdk);
      if (!selectedRequest) return;

      const currentQuery = String(sdk.httpHistory.getQuery());
      const newQuery =
        currentQuery.length > 0
          ? `${currentQuery} AND req.host.ne:"${selectedRequest.host}"`
          : `req.host.ne:"${selectedRequest.host}"`;
      sdk.httpHistory.setQuery(newQuery);
    },
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: "eb:excludehost",
    leadingIcon: "fa fa-ban",
  });

  sdk.commands.register("eb:excludepath", {
    name: "Exclude Path",
    run: async () => {
      const selectedRequest = await getSelectedRequest(sdk);
      if (!selectedRequest) return;

      const currentQuery = String(sdk.httpHistory.getQuery());
      const newQuery =
        currentQuery.length > 0
          ? `${currentQuery} AND req.path.ne:"${selectedRequest.path}"`
          : `req.path.ne:"${selectedRequest.path}"`;
      sdk.httpHistory.setQuery(newQuery);
    },
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: "eb:excludepath",
    leadingIcon: "fa fa-ban",
  });
};

const getSelectedRequestID = () => {
  return document
    .querySelector("[data-request-id]")
    ?.getAttribute("data-request-id");
};

const getSelectedRequest = async (sdk: FrontendSDK) => {
  const selectedRequestID = getSelectedRequestID();
  if (selectedRequestID === null || selectedRequestID === undefined) return;

  const request = await sdk.graphql.request({
    id: selectedRequestID,
  });

  return request?.request;
};

export const excludeHostPath = createFeature("exclude-host-path", {
  onFlagEnabled: (sdk: FrontendSDK) => {
    excludeHostPathFunctionality(sdk);
  },
  onFlagDisabled: (sdk: FrontendSDK) => {
    location.reload();
  },
});
