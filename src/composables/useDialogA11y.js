/**
 * 弹窗的键盘可达性：Escape 关闭 + 焦点圈 + 打开时聚焦 + 关闭后焦点归位。
 *
 * 为什么需要单独抽出来：
 * 光写 `role="dialog" aria-modal="true"` 是**没有实际作用**的 —— 浏览器不会因此
 * 限制焦点。实测过导出面板：Tab 能从弹窗一路跳到被遮住的页面按钮上（12 次里有 6 次
 * 跑出去），回车就点到了看不见的东西；Escape 也关不掉。鼠标用户完全无感，
 * 所以这个 bug 能一直藏着。
 *
 * 用法：
 *   const dialogRef = ref(null);
 *   useDialogA11y(isOpen, dialogRef, { onClose: close });
 *
 *   <section ref="dialogRef" role="dialog" aria-modal="true">
 *
 * 注意 isOpen 和 containerRef 要指向「同一个弹窗」：弹窗用 v-if 渲染时，
 * containerRef 只在打开期间有值，所以这里用 flush: "post" 等 DOM 出来再聚焦。
 */
import { onBeforeUnmount, watch } from "vue";

/** 可聚焦元素。排除 disabled 和 tabindex="-1"（后者只能被脚本聚焦） */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

/**
 * 已经打开的弹窗，后进先出。
 * Escape 只关最上面那个 —— 否则确认框盖在表单上时，一下 Escape 会把两个都关掉。
 */
const openStack = [];

function isVisible(element) {
  // 不用 offsetParent：position: fixed 的子树里 offsetParent 会是 null，
  // 明明看得见却被判成不可见，焦点圈就漏了。
  return element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== "hidden";
}

export function useDialogA11y(isOpen, containerRef, { onClose, lockScroll = true } = {}) {
  // 每个弹窗一个身份对象，用来在 openStack 里认出自己
  const identity = {};
  let previousActive = null;
  let previousOverflow = "";

  function focusableItems() {
    const root = containerRef.value;
    if (!root) return [];
    return [...root.querySelectorAll(FOCUSABLE)].filter(isVisible);
  }

  function focusFirst() {
    const items = focusableItems();
    // 优先聚焦显式标了 data-autofocus 的元素（比如输入框），否则第一个
    const target = items.find((element) => element.hasAttribute("data-autofocus")) || items[0];
    target?.focus?.();
  }

  function onKeydown(event) {
    // 只有最上层的弹窗响应键盘
    if (openStack[openStack.length - 1] !== identity) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
      return;
    }

    if (event.key !== "Tab") return;

    const items = focusableItems();
    if (!items.length) {
      // 弹窗里没有可聚焦元素：别让 Tab 把焦点带到背后页面上
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = containerRef.value?.contains(active);

    // 焦点还在弹窗外（刚打开、或用户用鼠标点了遮罩），把 Tab 拉回来
    if (!inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  watch(
    isOpen,
    (open) => {
      if (typeof document === "undefined") return;

      if (open) {
        previousActive = document.activeElement;
        previousOverflow = document.body.style.overflow;
        if (lockScroll) document.body.style.overflow = "hidden";
        openStack.push(identity);
        // 捕获阶段：抢在页面上的其它 keydown 之前处理
        window.addEventListener("keydown", onKeydown, true);
        // 等这一帧渲染完，弹窗里的元素才存在
        requestAnimationFrame(focusFirst);
        return;
      }

      window.removeEventListener("keydown", onKeydown, true);
      const index = openStack.indexOf(identity);
      if (index !== -1) openStack.splice(index, 1);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      // 焦点还给打开弹窗的那个按钮，键盘用户才不会丢失位置
      if (previousActive instanceof HTMLElement && document.contains(previousActive)) {
        previousActive.focus?.();
      }
      previousActive = null;
    },
    { flush: "post" }
  );

  onBeforeUnmount(() => {
    if (typeof document === "undefined") return;
    window.removeEventListener("keydown", onKeydown, true);
    const index = openStack.indexOf(identity);
    if (index !== -1) openStack.splice(index, 1);
    if (lockScroll) document.body.style.overflow = previousOverflow;
  });

  return { focusFirst };
}
