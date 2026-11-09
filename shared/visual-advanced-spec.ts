/** Persisted contract for the media/layout and interactive widget packs. */
export const advancedVisualSpec = {
  ImageCaption:{image:'image',alt:'text',caption:'long'},
  ImageLinkCard:{image:'image',alt:'text',heading:'text',url:'url'},
  ImageMosaic:{heading:'text',image1:'image',alt1:'text',image2:'image',alt2:'text',image3:'image',alt3:'text',image4:'image',alt4:'text'},
  VideoCaption:{url:'image',poster:'image',label:'text',caption:'long'},
  ImageHero:{image:'image',alt:'text',heading:'text',text:'long',buttonText:'text',url:'url'},
  PortraitProfile:{image:'image',alt:'text',name:'text',role:'text',bio:'long'},
  AudioPlayer:{url:'image',label:'text',caption:'long'},
  ImageComparison:{heading:'text',before:'image',beforeAlt:'text',after:'image',afterAlt:'text'},
  ImageCarousel:{heading:'text',image1:'image',alt1:'text',image2:'image',alt2:'text',image3:'image',alt3:'text'},
  LightboxImage:{image:'image',alt:'text',caption:'text'},
  Container:{width:'width',padding:'space',background:'color',content:'slot'},
  Stack:{gap:'space',content:'slot'},
  SplitLayout:{ratio:'split',gap:'space',first:'slot',second:'slot'},
  CardLayout:{background:'color',border:'color',padding:'space',content:'slot'},
  RowsLayout:{gap:'space',top:'slot',bottom:'slot'},
  ContentTabs:{heading:'text',title1:'text',text1:'long',title2:'text',text2:'long',title3:'text',text3:'long'},
  ExpandText:{heading:'text',summary:'long',more:'long',openLabel:'text',closeLabel:'text'},
  TogglePanels:{heading:'text',label1:'text',text1:'long',label2:'text',text2:'long'},
  TestimonialSlider:{heading:'text',quote1:'long',name1:'text',quote2:'long',name2:'text',quote3:'long',name3:'text'},
  PriceToggle:{heading:'text',label1:'text',price1:'text',label2:'text',price2:'text',description:'long'},
  DismissBanner:{text:'text',buttonText:'text',url:'url',background:'color',color:'color'},
  CopyCode:{heading:'text',code:'text',description:'long'},
} as const;

/** Zones exposed in the accessible quick-add picker, independent of rendering. */
export const visualSlotNames:Record<string,string[]> = {
  Section:['content'],Columns:['left','right'],ColumnsThree:['first','second','third'],ColumnsFour:['first','second','third','fourth'],
  AnchorSection:['content'],Container:['content'],Stack:['content'],SplitLayout:['first','second'],CardLayout:['content'],RowsLayout:['top','bottom'],
};
