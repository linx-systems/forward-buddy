declare namespace browser {
  namespace i18n {
    function getMessage(key: string): string;
  }

  namespace storage {
    namespace local {
      function get(keys: string | string[]): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
    }
  }

  namespace runtime {
    const onMessage: {
      addListener(
        callback: (message: any, sender: any) => Promise<any> | void
      ): void;
    };
    function sendMessage(message: any): Promise<any>;
    function openOptionsPage(): void;
  }

  namespace messageDisplay {
    interface MessageHeader {
      id: number;
      author: string;
      subject: string;
      recipients: string[];
      ccList: string[];
      bccList: string[];
      date: Date;
      folder?: { accountId: string; path: string };
    }

    const onMessagesDisplayed: {
      addListener(
        callback: (tab: tabs.Tab, messages: any) => void
      ): void;
    };

    function getDisplayedMessages(tabId: number): Promise<any>;
  }

  namespace messageDisplayAction {
    function setBadgeText(details: { text: string | null; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string | null; tabId?: number }): Promise<void>;
    function setTitle(details: { title: string | null; tabId?: number }): Promise<void>;
  }

  namespace tabs {
    interface Tab {
      id: number;
      windowId: number;
      active: boolean;
      type?: string;
    }
    function getCurrent(): Promise<Tab>;
    function query(queryInfo: Record<string, unknown>): Promise<Tab[]>;
  }
}
