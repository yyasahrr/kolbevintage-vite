import type {Config} from '@puckeditor/core';
import type {ReactNode} from 'react';
import type {CommerceKind,CommerceProps} from './visual-commerce-spec';
const text=(label:string)=>({type:'text' as const,label});
const count={type:'number' as const,label:'تعداد (۱ تا ۱۲)',min:1,max:12};
const heading=text('عنوان');
const productId=text('شناسه محصول');
const categoryId=text('شناسه دسته‌بندی');
export function makeCommerceComponents(render:(kind:CommerceKind,props:CommerceProps)=>ReactNode):Config['components']{
 return {
  LiveFeatured:{label:'محصولات منتخب فروشگاه',fields:{heading,count},defaultProps:{heading:'محصولات منتخب',count:4},render:p=><>{render('LiveFeatured',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveAvailable:{label:'محصولات موجود',fields:{heading,count},defaultProps:{heading:'محصولات موجود',count:4},render:p=><>{render('LiveAvailable',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveLowStock:{label:'موجودی محدود',fields:{heading,count},defaultProps:{heading:'موجودی محدود',count:4},render:p=><>{render('LiveLowStock',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveOrderLeaders:{label:'بیشترین سفارش ثبت‌شده',fields:{heading,count},defaultProps:{heading:'بیشترین سفارش ثبت‌شده',count:4},render:p=><>{render('LiveOrderLeaders',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveCategory:{label:'محصولات یک دسته',fields:{heading,count,categoryId},defaultProps:{heading:'محصولات دسته',count:4,categoryId:''},render:p=><>{render('LiveCategory',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveProduct:{label:'محصول انتخابی',fields:{heading,productId},defaultProps:{heading:'محصول منتخب',productId:''},render:p=><>{render('LiveProduct',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveRelated:{label:'محصولات مکمل',fields:{heading,count,productId},defaultProps:{heading:'محصولات مکمل',count:4,productId:''},render:p=><>{render('LiveRelated',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveWishlist:{label:'علاقه‌مندی‌های بازدیدکننده',fields:{heading,count},defaultProps:{heading:'علاقه‌مندی‌های شما',count:4},render:p=><>{render('LiveWishlist',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveCartSummary:{label:'خلاصه سبد بازدیدکننده',fields:{heading,buttonText:text('متن دکمه')},defaultProps:{heading:'سبد خرید شما',buttonText:'مشاهده سبد'},render:p=><>{render('LiveCartSummary',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveProductStatus:{label:'وضعیت موجودی محصول',fields:{heading,productId},defaultProps:{heading:'وضعیت محصول',productId:''},render:p=><>{render('LiveProductStatus',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveCategorySpotlight:{label:'معرفی دسته زنده',fields:{heading,categoryId},defaultProps:{heading:'دسته منتخب',categoryId:''},render:p=><>{render('LiveCategorySpotlight',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
  LiveSearch:{label:'جست‌وجوی محصولات',fields:{heading,placeholder:text('متن راهنما'),buttonText:text('متن دکمه')},defaultProps:{heading:'جست‌وجو در فروشگاه',placeholder:'نام محصول، دسته یا رنگ',buttonText:'جست‌وجو'},render:p=><>{render('LiveSearch',{heading:p.heading,count:p.count,productId:p.productId,categoryId:p.categoryId,buttonText:p.buttonText,placeholder:p.placeholder})}</>},
 };
}
