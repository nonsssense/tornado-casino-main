/**
 * RouteController contract — generic lifecycle for every page/game.
 *
 * The router only speaks this interface. Games never special-case in the router.
 */

/**
 * @typedef {object} RoutePolicy
 * @property {boolean} retainController
 * @property {boolean} retainDom
 * @property {boolean} immersive
 * @property {boolean} [showRouteSkeleton]
 */

/**
 * @typedef {object} ActivateContext
 * @property {'navigate'|'locale'|'rehydrate'} reason
 * @property {string|null} fromRoute
 * @property {AbortSignal} signal
 */

/**
 * @typedef {object} DeactivateContext
 * @property {'navigate'|'locale'|'destroy'} reason
 * @property {string|null} toRoute
 */

/**
 * @typedef {object} RouteController
 * @property {string} name
 * @property {RoutePolicy} policy
 * @property {() => HTMLElement} getRoot
 * @property {() => (void|Promise<void>)} load
 * @property {(ctx: ActivateContext) => (void|Promise<void>)} activate
 * @property {(ctx: DeactivateContext) => (void|Promise<void>)} deactivate
 * @property {() => (void|Promise<void>)} destroy
 * @property {() => boolean} [shouldDiscardAfterDeactivate]
 */

/**
 * @param {Partial<RoutePolicy>} [overrides]
 * @returns {RoutePolicy}
 */
export function defineRoutePolicy(overrides = {}) {
  return {
    retainController: true,
    retainDom: true,
    immersive: false,
    showRouteSkeleton: false,
    ...overrides,
  };
}

/**
 * Build a RouteController from explicit handlers.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {RoutePolicy} options.policy
 * @param {() => HTMLElement} options.createRoot
 * @param {(root: HTMLElement) => (void|Promise<void>)} [options.load]
 * @param {(root: HTMLElement, ctx: ActivateContext) => (void|Promise<void>)} options.activate
 * @param {(root: HTMLElement, ctx: DeactivateContext) => (void|Promise<void>)} options.deactivate
 * @param {(root: HTMLElement) => (void|Promise<void>)} [options.destroy]
 * @param {() => boolean} [options.shouldDiscardAfterDeactivate]
 * @returns {RouteController}
 */
export function createRouteController(options) {
  const {
    name,
    policy,
    createRoot,
    load: loadHandler,
    activate: activateHandler,
    deactivate: deactivateHandler,
    destroy: destroyHandler,
    shouldDiscardAfterDeactivate,
  } = options;

  /** @type {HTMLElement|null} */
  let root = null;
  let loaded = false;
  let active = false;
  let destroyed = false;

  function ensureRoot() {
    if (!root) {
      root = createRoot();
    }
    return root;
  }

  return {
    name,
    policy,

    getRoot() {
      return ensureRoot();
    },

    async load() {
      if (destroyed) return;
      ensureRoot();
      if (loaded) return;
      if (loadHandler) {
        await loadHandler(root);
      }
      loaded = true;
    },

    async activate(ctx) {
      if (destroyed) return;
      ensureRoot();
      if (!loaded) {
        await this.load();
      }
      if (ctx.signal?.aborted) return;
      await activateHandler(root, ctx);
      if (ctx.signal?.aborted) return;
      active = true;
    },

    async deactivate(ctx) {
      if (destroyed) return;
      // Always tear down — activate may have been aborted after starting runtime.
      if (root) {
        await deactivateHandler(root, ctx);
      }
      active = false;
    },

    async destroy() {
      if (destroyed) return;
      if (active || root) {
        await deactivateHandler(root, { reason: 'destroy', toRoute: null });
      }
      if (destroyHandler && root) {
        await destroyHandler(root);
      }
      if (root) {
        root.replaceChildren();
      }
      root = null;
      loaded = false;
      active = false;
      destroyed = true;
    },

    shouldDiscardAfterDeactivate:
      typeof shouldDiscardAfterDeactivate === 'function'
        ? shouldDiscardAfterDeactivate
        : undefined,
  };
}
