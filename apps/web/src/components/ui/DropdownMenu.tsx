import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type DropdownMenuProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  align?: "end" | "start";
};

export function DropdownMenu({
  open,
  onClose,
  anchorRef,
  children,
  className,
  align = "end",
}: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 4;
    const margin = 8;

    let top = anchorRect.bottom + gap;
    if (top + menuRect.height > window.innerHeight - margin) {
      top = anchorRect.top - menuRect.height - gap;
    }

    let left =
      align === "end" ? anchorRect.right - menuRect.width : anchorRect.left;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - menuRect.width - margin),
    );
    top = Math.max(
      margin,
      Math.min(top, window.innerHeight - menuRect.height - margin),
    );

    setStyle({ top, left, visibility: "visible" });
  }, [anchorRef, align]);

  useLayoutEffect(() => {
    if (!open) return;
    setStyle({ visibility: "hidden" });
    requestAnimationFrame(updatePosition);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        "fixed z-50 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-soft",
        className,
      )}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
