import * as CSS from "csstype";
import { uuid } from "./util/uuid";
type CSSProperties = CSS.Properties<string | number>;
type TMessageInfo = {
  message: string | ArrayBufferLike | Blob | ArrayBufferView;
  sendSide: "client" | "server";
};

const storageKey = "ws-console-location";

function JsonFormat(json: string) {
  const obj = JSON.parse(json);
  const formatResult = JSON.stringify(obj, null, 2);
  const result = formatResult
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");

  return result.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:.\d*)?(?:[eE][+-]?\d+)?)/g,
    function (match) {
      let cls = "color:darkorange";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "color:red";
        } else {
          cls = "color:green";
        }
      } else if (/true|false/.test(match)) {
        cls = "color:blue";
      } else if (/null/.test(match)) {
        cls = "color:magenta";
      }
      return '<span style="' + cls + '">' + match + "</span>";
    }
  );
}

function setStyle(element: HTMLElement, style: CSSProperties) {
  Object.entries(style).forEach(
    // @ts-ignore 暂时避免
    ([key, value]) => (element.style[key as keyof CSSProperties] = value)
  );
}

function aniFade(
  element: HTMLElement | null,
  action: "in" | "out",
  options?: number | KeyframeAnimationOptions
) {
  element?.animate(
    [
      {
        opacity: action === "in" ? "0" : element.style.opacity,
        pointerEvents: action === "in" ? "none" : "auto",
      },
      {
        opacity: action === "out" ? "0" : element.style.opacity,
        pointerEvents: action === "out" ? "none" : "auto",
      },
    ],
    options ?? {
      duration: 150,
      iterations: 1,
      fill: "forwards",
    }
  );
}

export class WsConsole {
  private wsInstanceMap = new Map<
    string,
    {
      instance: WebSocket;
      messageList: Array<TMessageInfo>;
    }
  >();
  private _isOpen = false;
  private _activeUID = "";

  // 容器部分
  private container: HTMLElement | null = null;
  private mask: HTMLElement | null = null;
  private button: HTMLElement | null = null;
  // 内容部分
  private messagePanel: HTMLElement | null = null;
  private messageLeftPart: HTMLElement | null = null;
  private messageRightPart: HTMLElement | null = null;
  private messageTopPart: HTMLElement | null = null;

  set isOpen(value) {
    if (value) {
      this.mount();
      this.renderMessage();
      this.container?.animate(
        [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
        {
          duration: 150,
          iterations: 1,
          fill: "forwards",
        }
      );
      aniFade(this.mask, "in");
    } else {
      this.container?.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }],
        {
          duration: 150,
          iterations: 1,
          fill: "forwards",
        }
      );
      aniFade(this.mask, "out");
    }
    this._isOpen = value;
  }
  get isOpen() {
    return this._isOpen;
  }

  get activeUId() {
    return this._activeUID;
  }

  set activeUId(value) {
    this._activeUID = value;
    this.renderMessage();
  }
  constructor() {
    if (!globalThis.WebSocket) {
      return;
    }
    this.renderButton();
    const ws = globalThis.WebSocket;
    globalThis.WebSocket = new Proxy(ws, {
      construct: (...arg) => {
        const instance: WebSocket = Reflect.construct(...arg);
        const id = uuid();

        const messageHandler = (message: TMessageInfo) => {
          const wsInfo = this.wsInstanceMap.get(id);
          if (wsInfo?.messageList) {
            wsInfo.messageList.push(message);
          }
          this.activeUId === id && this.renderRight();
        };

        instance.addEventListener("message", (data) => {
          messageHandler({ sendSide: "server", message: data.data });
        });
        instance.addEventListener("close", this.renderLeft.bind(this));
        instance.addEventListener("error", this.renderLeft.bind(this));
        instance.addEventListener("open", this.renderLeft.bind(this));
        const originSend = instance.send;
        instance.send = (data) => {
          messageHandler({ sendSide: "client", message: data });
          originSend.call(instance, data);
        };

        this.wsInstanceMap.set(id, { instance, messageList: [] });
        return instance;
      },
    });
  }

  private clear() {
    Array.from(this.wsInstanceMap.entries()).forEach((item) => {
      if (item[1].instance.readyState !== WebSocket.OPEN) {
        this.wsInstanceMap.delete(item[0]);
      }
    });
    const activeWs = this.wsInstanceMap.get(this.activeUId);
    if (this.messageLeftPart) {
      this.messagePanel?.removeChild(this.messageLeftPart);
      this.messageLeftPart = null;
    }
    if (this.messageRightPart) {
      this.messagePanel?.removeChild(this.messageRightPart);
      this.messageRightPart = null;
    }
    if (!activeWs) {
      this.activeUId = [...this.wsInstanceMap.keys()][0];
      return;
    }
    this.renderMessage();
  }
  private mount() {
    if (!this.container) {
      const mainPanel = this.getPanelDom();
      this.container = mainPanel;
      document.body.appendChild(mainPanel);
    }
    if (!this.mask) {
      const mask = this.getPanelMask();
      this.mask = mask;
      document.body.appendChild(mask);
    }
  }

  private getPanelDom() {
    const mainPanel = document.createElement("div");
    const mainPanelStyle: CSSProperties = {
      height: "80vh",
      width: "100%",
      position: "fixed",
      bottom: "0",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#fff",
    };

    setStyle(mainPanel, mainPanelStyle);
    return mainPanel;
  }

  private getPanelMask() {
    const div = document.createElement("div");
    const style: CSSProperties = {
      height: "100%",
      width: "100%",
      position: "fixed",
      top: "0",
      left: "0",
      zIndex: 9998,
      backgroundColor: "#000",
      opacity: 0.5,
    };
    div.addEventListener("click", () => (this.isOpen = false));
    setStyle(div, style);
    return div;
  }

  private getFunctionDom() {
    const functionDiv = document.createElement("div");
    const functionStyle: CSSProperties = {
      width: "100%",
      display: "flex",
      padding: "6px 0",
      justifyContent: "space-evenly",
      backgroundColor: "#00000020",
      alignItems: "center",
    };
    const functionList: { text: string; onClick: () => void }[] = [
      { text: "清除", onClick: () => this.clear() },
    ];
    functionList.forEach((item) => {
      const div = document.createElement("div");
      const style: CSSProperties = {
        height: "100%",
        width: "fit-content",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        cursor: "pointer",
        padding: "2px 12px",
        border: "1px solid #00000020",
        borderTop: "none",
        borderBottom: "none",
        boxSizing: "border-box",
        backgroundColor: "white",
        borderRadius: "4px",
      };
      setStyle(div, style);
      div.innerHTML = item.text;
      div.addEventListener("click", item.onClick);
      functionDiv.appendChild(div);
    });
    setStyle(functionDiv, functionStyle);
    return functionDiv;
  }

  /** renderer */
  private renderButton() {
    const div = document.createElement("div");
    const style: CSSProperties = {
      height: "30px",
      width: "100px",
      position: "fixed",
      top: `${this.getStorageLocation().y}px`,
      left: `${this.getStorageLocation().x}px`,
      zIndex: 9997,
      backgroundColor: "#000",
      color: "#fff",
      cursor: "pointer",
      borderRadius: "4px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    };
    setStyle(div, style);

    // 拖拽能力
    div.addEventListener("touchstart", (e) => {
      e.stopPropagation();
      const moveHandler = (e: TouchEvent) => {
        e.stopPropagation();
        const x = e.touches[0].clientX - div.clientWidth / 2;
        const y = e.touches[0].clientY - div.clientHeight / 2;
        this.storageLocation(x, y);
        setStyle(div, {
          left: `${x}px`,
          top: `${y}px`,
        });
      };
      const endHandler = () => {
        div.removeEventListener("touchmove", moveHandler);
        div.removeEventListener("touchend", endHandler);
      };
      div.addEventListener("touchmove", moveHandler);
      div.addEventListener("touchend", endHandler);
    });

    div.innerHTML = "WSConsole";
    div.addEventListener("click", () => {
      this.isOpen = !this.isOpen;
      this.mount();
    });
    if (!this.button) {
      this.button = div;
      document.body.appendChild(div);
    }
  }

  private renderMessage() {
    if (!this.container) {
      return;
    }

    const messagePanel = document.createElement("div");
    const style: CSSProperties = {
      flex: "1",
      width: "100%",
      overflow: "auto",
      padding: "10px",
      boxSizing: "border-box",
      display: "flex",
    };

    setStyle(messagePanel, style);
    this.renderTop();
    if (!this.messagePanel) {
      this.container.appendChild(messagePanel);
      this.messagePanel = messagePanel;
    }
    this.renderLeft();
    this.renderRight();
  }

  private renderLeft() {
    if (!this.messagePanel) return;
    const instanceList = Array.from(this.wsInstanceMap.entries());
    const getStyle = (uuid: string, index: number): CSSProperties => {
      const style: CSSProperties = {
        height: "28px",
        width: "100%",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        overflow: "hidden",
        borderBottom: "1px solid #00000020",
        cursor: "pointer",
        padding: "4px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        transition: "all 0.3s ease",
        borderRadius: "4px",
        margin: "2px 0px",
        backgroundColor:
          instanceList[index][1].instance.readyState === WebSocket.OPEN
            ? "#67C23A"
            : "#F56C6C",
        color: "white",
        opacity: this.activeUId === uuid ? "1" : "0.6",
      };
      if (this.activeUId) {
        style.opacity = this.activeUId === uuid ? "1" : "0.6";
      }
      return style;
    };
    if (this.activeUId === "" && instanceList?.[0]?.[0]) {
      this.activeUId = instanceList[0][0];
    }

    const handleClickItem = (i: number) => {
      this._activeUID = instanceList[i][0];
      if (this.messageRightPart) {
        this.messagePanel?.removeChild(this.messageRightPart);
        this.messageRightPart = null;
      }
      this.renderMessage();
    };
    if (!this.messageLeftPart) {
      const leftDiv = document.createElement("div");

      const leftStyle: CSSProperties = {
        height: "100%",
        width: "30%",
      };

      for (let i = 0; i < instanceList.length; i++) {
        const singleDiv = document.createElement("div");
        const singleStyle: CSSProperties = getStyle(instanceList[i][0], i);
        singleDiv.addEventListener("click", () => handleClickItem(i));
        setStyle(singleDiv, singleStyle);
        singleDiv.innerHTML = instanceList[i][1].instance.url;
        leftDiv.appendChild(singleDiv);
      }
      setStyle(leftDiv, leftStyle);
      this.messagePanel?.appendChild(leftDiv);
      this.messageLeftPart = leftDiv;
    } else {
      for (let i = 0; i < this.messageLeftPart.childNodes.length; i++) {
        const singleDiv = this.messageLeftPart.childNodes[i] as HTMLElement;
        setStyle(singleDiv, getStyle(instanceList[i][0], i));
      }
      for (
        let i = this.messageLeftPart.childNodes.length;
        i < instanceList.length;
        i++
      ) {
        const singleDiv = document.createElement("div");
        const singleStyle: CSSProperties = getStyle(instanceList[i][0], i);
        singleDiv.addEventListener("click", () => handleClickItem(i));
        setStyle(singleDiv, singleStyle);
        singleDiv.innerHTML = instanceList[i][1].instance.url;
        this.messageLeftPart.appendChild(singleDiv);
      }
    }
  }

  private renderRight() {
    if (!this.messagePanel) return;
    const messageList =
      this.wsInstanceMap.get(this.activeUId)?.messageList || [];
    const getNewMessageDom = (index: number) => {
      const message = messageList[index].message;
      const singleDiv = document.createElement("div");
      const singleStyle: CSSProperties = {
        margin: "10px 0",
        borderRadius: "4px",
        width: "100%",
      };

      setStyle(singleDiv, singleStyle);
      singleDiv.innerHTML = `<pre style="width:fit-content;background-color:${
        messageList[index].sendSide === "client" ? "#D5F3F4" : "#00000020"
      };padding:8px;border-radius:8px">${JsonFormat(message.toString())}</pre>`;
      return singleDiv;
    };

    if (!this.messageRightPart) {
      const rightDiv = document.createElement("div");
      const rightStyle: CSSProperties = {
        height: "100%",
        width: "70%",
        paddingLeft: "10px",
        boxSizing: "border-box",
        overflow: "auto",
      };

      for (let i = 0; i < messageList.length; i++) {
        rightDiv.appendChild(getNewMessageDom(i));
      }
      setStyle(rightDiv, rightStyle);
      this.messageRightPart &&
        this.messagePanel?.removeChild(this.messageRightPart);
      this.messagePanel?.appendChild(rightDiv);
      this.messageRightPart = rightDiv;
    } else {
      for (
        let i = this.messageRightPart.childNodes.length;
        i < messageList.length;
        i++
      ) {
        this.messageRightPart.appendChild(getNewMessageDom(i));
      }
    }
    this.messageRightPart.scrollTo(0, this.messageRightPart.scrollHeight);
  }

  private renderTop() {
    if (!this.messageTopPart) {
      this.messageTopPart = this.getFunctionDom();
      this.container?.appendChild(this.messageTopPart);
    }
  }

  private storageLocation(x: number, y: number) {
    localStorage.setItem(storageKey, JSON.stringify({ x, y }));
  }

  private getStorageLocation() {
    const result = localStorage.getItem(storageKey);
    if (result) {
      const obj = JSON.parse(result);
      return { x: obj?.x ?? 100, y: obj?.y ?? 100 };
    } else {
      return {
        x: 100,
        y: 100,
      };
    }
  }
}
