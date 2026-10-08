import { WORLD_STRATEGY, type DiscoveryStrategy } from "@/flow";

/**
 * The V3 experience's discovery strategy. V3 tests WORLD-LED discovery; V2 (frozen) is BRAND-LED. The experience (UI,
 * question UX, result UX) does not depend on which strategy is plugged in here: switching this to `BRAND_STRATEGY`
 * would run the redesigned UX over V2's brand projects (cards, copy, analytics vocabulary and persistence follow the
 * strategy). That modularity is intentional (DEC-034).
 */
export const V3_STRATEGY: DiscoveryStrategy = WORLD_STRATEGY;
