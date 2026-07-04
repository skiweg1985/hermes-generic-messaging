/// <reference types="vite/client" />

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRectReadOnly;
}

interface Navigator {
  virtualKeyboard?: VirtualKeyboard;
}
