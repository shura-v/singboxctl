export type ParsedVlessUri = {
  encryption: string;
  flow: string;
  fingerprint: string;
  hasInvalidUserEncoding: boolean;
  portText: string;
  publicKey: string;
  protocol: string;
  security: string;
  server: string;
  serverName: string;
  serverPort: number;
  shortId: string;
  spiderX: string;
  stream: string;
  queryParameterNames: string[];
  uuid: string;
};

export type VlessOutbound = {
  flow?: string;
  server: string;
  server_port: number;
  tls?: {
    enabled: true;
    insecure: false;
    reality: {
      enabled: true;
      public_key: string;
      short_id: string;
    };
    server_name?: string;
    utls?: {
      enabled: true;
      fingerprint: string;
    };
  };
  type: "vless";
  uuid: string;
};
