export const __USER_ACTION__ = {
  __DELETE__: false,
  __CURRENT_DATA__: undefined as undefined | any,
  __SESSION_DATA__: undefined as Record<string, any> | undefined,
};

export function __SET_CURRENT__(data: any) {
  __USER_ACTION__.__CURRENT_DATA__ = data;
}

class _Session {
  setData(data: Record<string, any>) {
    __USER_ACTION__.__SESSION_DATA__ = data;
  }
  getData() {
    return __USER_ACTION__.__CURRENT_DATA__;
  }
  delete() {
    __USER_ACTION__.__DELETE__ = true;
  }
}

export let Session = new _Session();
