/** Safe, serializable content and page-navigation widgets. */
export const utilityVisualSpec={
 AnchorSection:{anchor:'reference',content:'slot'},
 JumpLinks:{heading:'text',label1:'text',anchor1:'reference',label2:'text',anchor2:'reference',label3:'text',anchor3:'reference'},
 BackToTop:{label:'text'},
 SharePage:{label:'text'},
 PrintPage:{label:'text'},
 Countdown:{heading:'text',endTime:'utcDate',finished:'text'},
 ProgressMeter:{heading:'text',value:'percent',description:'long'},
 InfoTable:{heading:'text',label1:'text',value1:'text',label2:'text',value2:'text',label3:'text',value3:'text'},
 StoryTimeline:{heading:'text',date1:'text',title1:'text',text1:'long',date2:'text',title2:'text',text2:'long',date3:'text',title3:'text',text3:'long'},
 BusinessHours:{heading:'text',day1:'text',hours1:'text',day2:'text',hours2:'text',day3:'text',hours3:'text',note:'long'},
} as const;
