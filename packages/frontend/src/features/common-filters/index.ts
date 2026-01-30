import { createFeature } from "@/features/manager";
import { type FrontendSDK } from "@/types";

let intervalId: Timeout | undefined;
let projectChangeHandler: { stop: () => void } | undefined;

interface TimeFilter {
  name: string;
  minutes: number;
}

const TIME_FILTERS: TimeFilter[] = [
  { name: "recent", minutes: 5 },
  { name: "1hr", minutes: 60 },
  { name: "6hr", minutes: 360 },
  { name: "12hr", minutes: 720 },
  { name: "24hr", minutes: 1440 },
];

const createTimeBasedFilterQuery = (minutes: number): string => {
  const now = new Date();
  const pastTime = new Date(now.getTime() - minutes * 60 * 1000);
  const formattedDate =
    pastTime.getFullYear() +
    "-" +
    String(pastTime.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(pastTime.getDate()).padStart(2, "0") +
    " " +
    String(pastTime.getHours()).padStart(2, "0") +
    ":" +
    String(pastTime.getMinutes()).padStart(2, "0") +
    ":" +
    String(pastTime.getSeconds()).padStart(2, "0");
  return `req.created_at.gt:"${formattedDate}"`;
};

const maintainTimeFilters = async (sdk: FrontendSDK) => {
  const currentProject = sdk.projects.getCurrent();
  if (!currentProject) {
    // No project selected, skip silently
    return;
  }

  try {
    // Get all existing filters
    const existingFilters = sdk.filters.getAll();

    for (const timeFilter of TIME_FILTERS) {
      const filterQuery = createTimeBasedFilterQuery(timeFilter.minutes);

      // Check if filter already exists
      const existingFilter = existingFilters.find(
        (filter) => filter.name === timeFilter.name,
      );

      if (existingFilter) {
        // Update existing filter if the query has changed
        if (existingFilter.query !== filterQuery) {
          await sdk.filters.update(existingFilter.id, {
            name: timeFilter.name,
            alias: timeFilter.name,
            query: filterQuery,
          });
        }
      } else {
        // Create new filter
        await sdk.filters.create({
          name: timeFilter.name,
          alias: timeFilter.name,
          query: filterQuery,
        });
      }
    }
  } catch (error) {
    console.error("Error maintaining time filters:", error);
  }
};

const startFilterMaintenance = (sdk: FrontendSDK) => {
  // Stop any existing interval
  stopInterval();

  // Run immediately
  maintainTimeFilters(sdk);

  // Then run every minute
  intervalId = setInterval(() => {
    maintainTimeFilters(sdk);
  }, 60000); // 60,000ms = 1 minute
};

const stopInterval = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = undefined;
  }
};

const stopFilterMaintenance = async (sdk: FrontendSDK) => {
  stopInterval();

  // Stop listening to project changes
  if (projectChangeHandler) {
    projectChangeHandler.stop();
    projectChangeHandler = undefined;
  }

  // Check if a project is selected before trying to clean up
  const currentProject = sdk.projects.getCurrent();
  if (!currentProject) {
    return;
  }

  try {
    // Get all existing filters
    const existingFilters = sdk.filters.getAll();

    // Remove filters that match our time filter names
    for (const timeFilter of TIME_FILTERS) {
      const existingFilter = existingFilters.find(
        (filter) => filter.name === timeFilter.name,
      );

      if (existingFilter) {
        await sdk.filters.delete(existingFilter.id);
      }
    }
  } catch (error) {
    console.error("Error cleaning up time filters:", error);
    sdk.window.showToast("[EvenBetter] Error cleaning up time filters", {
      variant: "error",
    });
  }
};

export default createFeature("common-filters", {
  onFlagEnabled: (sdk: FrontendSDK) => {
    // Listen for project changes
    projectChangeHandler = sdk.projects.onCurrentProjectChange((event) => {
      if (event.projectId) {
        // Project selected, start maintenance
        startFilterMaintenance(sdk);
      } else {
        // No project selected, stop interval (but keep listening for project changes)
        stopInterval();
      }
    });

    // Start immediately if a project is already selected
    const currentProject = sdk.projects.getCurrent();
    if (currentProject) {
      startFilterMaintenance(sdk);
    }
  },
  onFlagDisabled: (sdk: FrontendSDK) => {
    stopFilterMaintenance(sdk);
  },
});

