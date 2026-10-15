export type SettingsProfile={id:string;email:string;displayName:string;bio:string;createdAt:string;avatarVersion:number;notifyMessages:boolean;notifyCalls:boolean;showOnline:boolean;showLastSeen:boolean};
export type Preferences=Pick<SettingsProfile,'notifyMessages'|'notifyCalls'|'showOnline'|'showLastSeen'>;
