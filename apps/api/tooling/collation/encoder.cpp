#include <unicode/ucol.h>
#include <unicode/udata.h>
#include <unicode/uversion.h>
#include <unicode/ustring.h>
#include <cstdlib>
#include <cstdint>
extern "C" const unsigned char icudt78_dat[];
static UCollator* collator = nullptr;
extern "C" {
int init() {
 if(collator) return 0;
 UErrorCode status=U_ZERO_ERROR;
 udata_setCommonData(icudt78_dat,&status);
 collator=ucol_open("en_US",&status);
 if(U_FAILURE(status))return status;
 ucol_setAttribute(collator,UCOL_NORMALIZATION_MODE,UCOL_ON,&status);
 ucol_setAttribute(collator,UCOL_STRENGTH,UCOL_TERTIARY,&status);
 ucol_setAttribute(collator,UCOL_CASE_LEVEL,UCOL_OFF,&status);
 ucol_setAttribute(collator,UCOL_NUMERIC_COLLATION,UCOL_OFF,&status);
 ucol_setAttribute(collator,UCOL_CASE_FIRST,UCOL_OFF,&status);
 ucol_setAttribute(collator,UCOL_ALTERNATE_HANDLING,UCOL_NON_IGNORABLE,&status);
 return U_FAILURE(status)?status:0;
}
void* allocate(uint32_t length){return malloc(length);}
void release(void* pointer){free(pointer);}
int32_t sort_key(const uint16_t* input,int32_t length,uint8_t* output,int32_t capacity){
 if(init()!=0)return -1;
 return ucol_getSortKey(collator,reinterpret_cast<const UChar*>(input),length,output,capacity);
}
int32_t lower_utf16(const uint16_t* input,int32_t length,uint16_t* output,int32_t capacity){
 UErrorCode status=U_ZERO_ERROR;
 int32_t result=u_strToLower(reinterpret_cast<UChar*>(output),capacity,reinterpret_cast<const UChar*>(input),length,"",&status);
 if(status==U_BUFFER_OVERFLOW_ERROR || U_SUCCESS(status))return result;
 return -1;
}
}
