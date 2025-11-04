import * as React from "react";
import {
  useFloating,
  offset,
  flip,
  shift,
  type Placement,
} from "@floating-ui/react";

type TooltipContextValue = {
  showTooltip: (
    text: string | React.ReactNode,
    target: HTMLElement,
    placement?: Placement
  ) => void;
  hideTooltip: () => void;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export function useSharedTooltip() {
  const ctx = React.useContext(TooltipContext);
  if (!ctx)
    throw new Error(
      "useSharedTooltip must be used inside SharedTooltipProvider"
    );
  return ctx;
}

export function SharedTooltipProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<{
    text: string | React.ReactNode | null;
    target: HTMLElement | null;
    placement?: Placement;
  }>({ text: null, target: null });

  const { refs, floatingStyles, update } = useFloating({
    middleware: [offset(8), flip(), shift()],
    placement: state.placement ?? "top",
  });

  // Update reference element when target changes
  React.useEffect(() => {
    refs.setReference(state.target);
    if (state.target) requestAnimationFrame(update);
  }, [state.target, refs, update]);

  const showTooltip = React.useCallback(
    (
      text: string | React.ReactNode,
      target: HTMLElement,
      placement?: Placement
    ) => {
      setState({ text, target, placement });
    },
    []
  );

  const hideTooltip = React.useCallback(() => {
    setState({ text: null, target: null });
  }, []);

  const value = React.useMemo(
    () => ({
      showTooltip,
      hideTooltip,
    }),
    [showTooltip, hideTooltip]
  );

  return (
    <TooltipContext.Provider value={value}>
      {children}
      {state.text && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="fixed z-50 select-none rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
        >
          {state.text}
        </div>
      )}
    </TooltipContext.Provider>
  );
}
