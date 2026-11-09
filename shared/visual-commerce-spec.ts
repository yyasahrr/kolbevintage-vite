/** Storefront widgets store identifiers/settings, never customer/cart data. */
export const commerceVisualSpec = {
  LiveFeatured:{heading:'text',count:'count'},
  LiveAvailable:{heading:'text',count:'count'},
  LiveLowStock:{heading:'text',count:'count'},
  LiveOrderLeaders:{heading:'text',count:'count'},
  LiveCategory:{heading:'text',count:'count',categoryId:'reference'},
  LiveProduct:{heading:'text',productId:'reference'},
  LiveRelated:{heading:'text',count:'count',productId:'reference'},
  LiveWishlist:{heading:'text',count:'count'},
  LiveCartSummary:{heading:'text',buttonText:'text'},
  LiveProductStatus:{heading:'text',productId:'reference'},
  LiveCategorySpotlight:{heading:'text',categoryId:'reference'},
  LiveSearch:{heading:'text',placeholder:'text',buttonText:'text'},
} as const;
export type CommerceKind=keyof typeof commerceVisualSpec;
export interface CommerceProps {heading:string;count?:number;categoryId?:string;productId?:string;buttonText?:string;placeholder?:string}
