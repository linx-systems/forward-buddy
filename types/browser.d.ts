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
}
