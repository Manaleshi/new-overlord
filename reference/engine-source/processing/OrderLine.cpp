head	1.8;
access;
symbols
	Version_0_6:1.6
	ver032:1.3;
locks; strict;
comment	@// @;


1.8
date	2012.06.03.14.11.14;	author asakrana;	state Exp;
branches;
next	1.7;

1.7
date	2010.02.24.09.33.17;	author asakrana;	state Exp;
branches;
next	1.6;

1.6
date	2009.05.29.17.08.58;	author asakrana;	state Exp;
branches;
next	1.5;

1.5
date	2006.01.29.17.31.31;	author asakrana;	state Exp;
branches;
next	1.4;

1.4
date	2004.05.27.13.21.36;	author asakrana;	state Exp;
branches;
next	1.3;

1.3
date	2004.05.14.17.01.05;	author asakrana;	state Exp;
branches;
next	1.2;

1.2
date	2004.01.08.11.32.04;	author asakrana;	state Exp;
branches;
next	1.1;

1.1
date	2003.08.13.08.38.59;	author asakrana;	state Exp;
branches;
next	;


desc
@@


1.8
log
@*** empty log message ***
@
text
@/** ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
*************************************************************************
 OrderLine.cpp . -------------------
 begin                : Tue Nov  5 11:46:00 IST 2002
 copyright            : (C) 2002 by Alex Dribin
 email                : Alex.Dribin@@gmail.com
fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff */
#include <sstream>
#include "OrderLine.h"
#include "Entity.h"
#include "OrderPrototype.h"
#include "OrderPrototypesCollection.h"
//#include "UnitEntity.h" //For Debugging only

extern bool testMode;



OrderLine::OrderLine( const string & order, Entity * entity )
{
  //    cout << entity->print()<<" New Order created: " << order<<endl;
  //  isParsed = false;
  Parser * parser = new Parser( order );
  executedOnDay_ = 0;
  isCompleted_ = false;
  dayRestricted_ = 0;
  state_ = NORMAL_STATE;
  whileCondition_ = false;
  ifConditionLevel = 0;
  reportFlags = 0;
  isPermanent_ = false;
  repetitionCounter_ = 0;
  parseModifiers( parser );
  parse( parser, entity );
  comment_ = parser->getText();
	ifStatement_ = false;
	elseStatement_ = false;
	endifStatement_ = false;
  ifStatementLevel = 0;
  elseStatementLevel = 0;
  delete parser;
}

const UINT OrderLine::NO_NORMAL_REPORT_FLAG = 0x01;
const UINT OrderLine::NO_ERROR_REPORT_FLAG = 0x02;



bool OrderLine::getCompletionFlag() const
{
  return isCompleted_;
}



OrderLine::~OrderLine()
{
  //#ifdef TEST_MODE
 //    /*if(testMode) */ cout << "Order deleted" << endl;
  //#endif

//   for ( vector < AbstractData * >::iterator iterator = parameters_.begin();
//        iterator != parameters_.end(); ++iterator )
//        {
//          ( * iterator )->clean();
//   }

}



void OrderLine::parseModifiers( Parser * parser )
{
  bool isParsing = true;

  while ( isParsing )
  {
    if ( parser->matchChar( PERMANENT_ORDER_SYMBOL ) )
    {
      isPermanent_ = true;
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( DAY_SPECIFIC_ORDER_SYMBOL ) )
    {
      if ( parser->matchInteger() )
      {
        dayRestricted_ = parser->getInteger();
        isParsing = true;
        continue;
      }
      isParsing = false;
      /* D without number */
      parser->rewind( -1 );
      continue;
    }
    if ( parser->matchChar( IF_CONDITION_SYMBOL ) )
    {
      ifConditionLevel++;
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( WHILE_CONDITION_SYMBOL ) )
    {
      whileCondition_ = true;
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( NO_ERROR_REPORT_SYMBOL ) )
    {
      reportFlags |= NO_ERROR_REPORT_FLAG;
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( NO_NORMAL_REPORT_SYMBOL ) )
    {
      reportFlags |= NO_NORMAL_REPORT_FLAG;
      isParsing = true;
      continue;
    }
    if ( parser->matchInteger() )
    {
      repetitionCounter_ = parser->getInteger();
      if ( repetitionCounter_ > 1 )
      {
        isParsing = true;
        continue;
      }
    }
    if ( parser->matchKeyword( "if" ) )
    {
      isParsing = true;
			ifStatement_ = true;
      continue;
    }
    if ( parser->matchKeyword( "else" ) )
    {
      isParsing = true;
			elseStatement_ = true;
      continue;
    }
    if ( parser->matchKeyword( "endif" ) )
    {
      isParsing = true;
			endifStatement_ = true;
      continue;
    }
    isParsing = false;
  }
}



void OrderLine::stripModifiers(Parser * parser )
{
  bool isParsing = true;
  int repetitionCounter;

  while ( isParsing )
  {
    if ( parser->matchChar( PERMANENT_ORDER_SYMBOL ) )
    {
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( DAY_SPECIFIC_ORDER_SYMBOL ) )
    {
      if ( parser->matchInteger() )
      {
        isParsing = true;
        continue;
      }
      isParsing = false;
      /* D without number */
      parser->rewind( -1 );
      continue;
    }
    if ( parser->matchChar( IF_CONDITION_SYMBOL ) )
    {
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( WHILE_CONDITION_SYMBOL ) )
    {
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( NO_ERROR_REPORT_SYMBOL ) )
    {
      isParsing = true;
      continue;
    }
    if ( parser->matchChar( NO_NORMAL_REPORT_SYMBOL ) )
    {
      isParsing = true;
      continue;
    }
    if ( parser->matchInteger() )
    {
      repetitionCounter = parser->getInteger();
      if ( repetitionCounter > 1 )
      {
        isParsing = true;
        continue;
      }
    }
    isParsing = false;
  }
}



bool OrderLine::parse( Parser * parser, Entity * entity )
{
  string tempKeyword = parser->getWord();
  // If keyword is "combat" we would like to insert  order
  orderPrototype_ = orderPrototypesCollection->find( tempKeyword );

  if ( orderPrototype_ == 0 )
  {
    if(elseStatement_ || endifStatement_)
      return true;
    else
    {
      if(!tempKeyword.empty())
      {
	cerr << "=xx= Parsing failed for order [" << tempKeyword << "] "
	<< parser->getText() << endl;
      }
    }
    return false;
  }
  
  else {
      //cout << " Order ->"<<orderPrototype_->getKeyword()<<endl;
      if ( orderPrototype_->
    loadParameters( parser, parameters_, entity ) == OK )
    return true;
  else
  {
    orderPrototype_ = 0;
    return false;
  }
  
}
}



ORDER_STATUS OrderLine::process( ProcessingMode * processingMode,
     Entity * entity )
     {
       ORDER_STATUS result;

//     if(entity->isTraced())                                  //For Debugging only
//       {                                                      //For Debugging only
//         cout <<"==== Trying to process "; printOrderLine(cout); //For Debugging only
//       }                                                     //For Debugging only


#ifdef TEST_MODE
       if ( testMode )
       {
         cout << "==== Trying to process ";
         save( cout );
       }
     #endif

       if ( orderPrototype_ == 0 )
		{
		if(elseStatement_ || endifStatement_)
         		return FAILURE;
					else
         		return INVALID;
		}
       if ( executedOnDay_ == gameFacade->getCurrentDay() )
       {
     #ifdef TEST_MODE
         if ( testMode )
           cout << "==== Was already executed on this day" << endl;
     #endif

/*           if(entity->isTraced())                                  //For Debugging only
           {                                                      //For Debugging only
             cout <<"==== Was already executed on this day" << endl;  //For Debugging only
           }  */                                                   //For Debugging only

         return FAILURE;
       }

       if ( entity->isFullDayOrderFlagSet() )
       {
     #ifdef TEST_MODE
         if ( testMode )
           cout << "==== Full day order Was already executed on this day"
                << endl;
     #endif
         return FAILURE;
       }
       if ( !orderPrototype_->mayBeProcessed( processingMode, entity ) )
       {
     #ifdef TEST_MODE
         if ( testMode )
           cout << "==== Order can't be processed duiring this mode" << endl;
     #endif

/*           if(entity->isTraced())                                  //For Debugging only
           {                                                      //For Debugging only
             cout <<"==== Order can't be processed duiring this mode "<< endl;  //For Debugging only
           }                                                     //For Debugging only
    
 */        return FAILURE;
       }

       if ( ( dayRestricted_ == 0 ) || ( dayRestricted_ == gameFacade->getCurrentDay() ) )
       {
         entity->setCurrentOrder( this );
         //cout<<"orderPrototype_->process:"<<entity->print()<<endl;//(&OrderPrototype::process)
         result = orderPrototype_->process( entity, parameters_ );
         //cout<<" ok." <<endl;//(&OrderPrototype::process)
         entity->setCurrentOrder( 0 );
       }
       else
         return FAILURE;
       if ( ( result == SUCCESS ) || ( result == IN_PROGRESS ) )
         executedOnDay_ = gameFacade->getCurrentDay();

       if ( ( result == FAILURE ) && isFullDayOrder() ) // This order was already checked
              executedOnDay_ = gameFacade->getCurrentDay();

       return result; 
}



ORDER_STATUS OrderLine::completeProcessing( Entity * entity, int result )
{
  entity->setCurrentOrder( this );
  ORDER_STATUS status =
       orderPrototype_->completeOrderProcessing( entity, parameters_, result );
  entity->setCurrentOrder( 0 );
  return status;
}



void OrderLine::save( ostream & out )
{
  out << "ORDER ";
  printOrderLine( out );
}

string OrderLine::print()
{
    stringstream ss;
    printOrderLine(ss);
    string s =ss.str(); 
    s.erase (s.begin()+ s.length()-1); // Remove new line
    return s;
}

void OrderLine::printOrderLine( ostream & out )
{
  vector < AbstractData * >::const_iterator iterator2;
  int i;
  if ( dayRestricted_ != 0 )
    out << DAY_SPECIFIC_ORDER_SYMBOL << dayRestricted_ << " ";
  if ( isPermanent_ ) out << PERMANENT_ORDER_SYMBOL;
  for ( i = 0; i < ifConditionLevel; i++ )
  {
    out << IF_CONDITION_SYMBOL;
  }
  if ( whileCondition_ ) out << WHILE_CONDITION_SYMBOL;

  if ( repetitionCounter_ > 1 ) out << repetitionCounter_;
  if ( reportFlags & NO_NORMAL_REPORT_FLAG ) out << NO_NORMAL_REPORT_SYMBOL;
  if ( reportFlags & NO_ERROR_REPORT_FLAG ) out << NO_ERROR_REPORT_SYMBOL;

  if(ifStatement_) out << "IF ";
  if(elseStatement_) out << "ELSE ";
  if(endifStatement_) out << "ENDIF ";

  if ( orderPrototype_ != 0 )
  {
    orderPrototype_->save( out );
    for ( iterator2 = parameters_.begin(); iterator2 != parameters_.end();
         iterator2++ )
         {
           ( * iterator2 )->saveAsParameter( out );
    }
  }

  out << comment_ << endl;
}



bool OrderLine::isFullDayOrder()
{
  return orderPrototype_->isFullDayOrder();

}



void OrderLine::setReportingFlag( UINT flag )
{
  reportFlags |= translate_( flag );
}



void OrderLine::clearReportingFlag( UINT flag )
{
  reportFlags &= translate_( ~flag );

}



bool OrderLine::getReportingFlag( UINT flag )
{
  return (( reportFlags & translate_( flag ) )!=0);
}



// reportFlags  - is a bitmap where first two bits are
// NO_NORMAL_REPORT_FLAG and NO_ERROR_REPORT_FLAG
// all other bits may be used be used by order objects




UINT OrderLine::translate_( UINT flag )
{
  return flag << 2; // 2 internal flags are already defined
}



PROCESSING_STATE OrderLine::getProcessingState() const
{
  return state_;
}



void OrderLine::setProcessingState( PROCESSING_STATE state )
{
  state_ = state;
}
@


1.7
log
@*** empty log message ***
@
text
@d8 1
d13 2
a14 2
#include "UnitEntity.h" //For Debugging only
extern int currentDay;
d218 1
a218 1
  //cout << " Order ->"<<orderPrototype_->getKeyword()<<endl;
d234 3
a236 1
  else if ( orderPrototype_->
d246 1
d255 4
a258 4
//        if(entity->isTraced())                                  //For Debugging only
//          {                                                      //For Debugging only
//            cout <<"==== Trying to process "; printOrderLine(cout); //For Debugging only
//          }                                                     //For Debugging only
d276 1
a276 1
       if ( executedOnDay_ == currentDay )
d315 1
a315 1
       if ( ( dayRestricted_ == 0 ) || ( dayRestricted_ == currentDay ) )
d326 1
a326 1
         executedOnDay_ = currentDay;
d329 1
a329 1
              executedOnDay_ = currentDay;
d353 8
a360 1

a388 1
//		out<<" ";
d423 1
a423 1
  return ( reportFlags & translate_( flag ) );
@


1.6
log
@Version 0.6
@
text
@d215 1
a215 1
// If keyword is "combat" we would like to insert  order
d217 1
a217 1
//cout << " Order ->"<<orderPrototype_->getKeyword()<<endl;
d220 10
a229 5
		if(elseStatement_ || endifStatement_)
         return true;
		else
		cerr << "=xx= Parsing failed for order " << tempKeyword << " "
         << parser->getText() << endl;
d234 2
a235 2
       loadParameters( parser, parameters_, entity ) == OK )
         return true;
d241 1
a241 1

d314 1
d316 1
@


1.5
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d6 1
a6 1
 email                : alexliza@@netvision.net.il
d12 1
d58 1
a58 1
  //   if(testMode)  cout << "Order deleted" << endl;
d61 5
a65 5
  for ( vector < AbstractData * >::iterator iterator = parameters_.begin();
       iterator != parameters_.end(); ++iterator )
       {
         ( * iterator )->clean();
  }
d215 1
d217 1
d227 1
d245 8
a252 1
     #ifdef TEST_MODE
d261 2
a262 2
			 	{
					if(elseStatement_ || endifStatement_)
d266 1
a266 1
				}
d273 6
d297 7
a303 1
         return FAILURE;
d371 1
@


1.4
log
@*** empty log message ***
@
text
@d1 7
a7 8
/***************************************************************************
                          OrderLine.cpp
                    .
                             -------------------
    begin                : Tue Nov  5 11:46:00 IST 2002
    copyright            : (C) 2002 by Alex Dribin
    email                : alexliza@@netvision.net.il
 ***************************************************************************/
d15 3
a17 1
OrderLine::OrderLine(const string & order, Entity * entity)
d19 3
a21 3
//    cout << entity->print()<<" New Order created: " << order<<endl;
//  isParsed = false;
  Parser * parser = new Parser(order);
d26 4
a29 4
	whileCondition_ = false;
	ifConditionLevel = 0;
	reportFlags = 0;
	isPermanent_ = false;
d31 9
a39 4
  parseModifiers(parser);
	parse(parser, entity);
	comment_ = parser->getText();
 delete parser;
d41 1
d44 7
a50 1
bool OrderLine::getCompletionFlag() const {return  isCompleted_;}
d56 3
a58 3
//#ifdef TEST_MODE
//   if(testMode)  cout << "Order deleted" << endl;
//#endif
d60 2
a61 2
 for (vector<AbstractData *>::iterator iterator = parameters_.begin();
                  iterator != parameters_.end(); ++iterator)
d63 2
a64 2
	        (*iterator)->clean();  
       }
d69 2
a70 2
void
OrderLine::parseModifiers(Parser * parser )
d72 1
a72 1
bool isParsing =true;
d74 123
a196 1
 while (isParsing)
d198 21
a218 70
  		if (parser -> matchChar (PERMANENT_ORDER_SYMBOL) )
    		{
					isPermanent_ = true;
					isParsing = true;
			 		continue;
    		}
  		if (parser -> matchChar (DAY_SPECIFIC_ORDER_SYMBOL) )
    		{
      		if (parser -> matchInteger()  )
						{
	  					dayRestricted_ = parser -> getInteger();
							isParsing = true;
			 				continue;
						}
       	isParsing = false;   /*   D without number */
        parser -> rewind(-1);
 			 	continue;
   			}
  		if (parser -> matchChar (IF_CONDITION_SYMBOL) )
    		{
							ifConditionLevel++;
							isParsing = true;
			 				continue;
    		}
  		if (parser -> matchChar (WHILE_CONDITION_SYMBOL) )
    		{
							whileCondition_ = true;
							isParsing = true;
			 				continue;
    		}
  		if (parser -> matchChar (NO_ERROR_REPORT_SYMBOL) )
    		{
							reportFlags |= NO_ERROR_REPORT_FLAG;
							isParsing = true;
			 				continue;
    		}
  		if (parser -> matchChar (NO_NORMAL_REPORT_SYMBOL) )
    		{
							reportFlags |= NO_NORMAL_REPORT_FLAG;
							isParsing = true;
			 				continue;
    		}
  		if (parser -> matchInteger()  )
    		{
      		repetitionCounter_ = parser -> getInteger();
      		if(repetitionCounter_ > 1)
      		{
							isParsing = true;
			 				continue;
      		}
    		}
		isParsing = false;
	}
}



bool
OrderLine::parse(Parser * parser, Entity * entity )
{
  string tempKeyword = parser -> getWord();
 	orderPrototype_ = orderPrototypesCollection->find (tempKeyword);
	if( orderPrototype_ == 0)
			{
     			cout  << "=xx= Parsing failed for order "<< tempKeyword << " "<<parser -> getText()<<endl;
  				return false;
			}
	else
 	 if (orderPrototype_ -> loadParameters(parser, parameters_ ,  entity) == OK)
	 	 return true;
d220 12
a231 4
			{
				orderPrototype_ = 0;
  			return false;
			}
d237 56
a292 47
ORDER_STATUS
OrderLine::process(ProcessingMode * processingMode, Entity * entity, ostream &out)
{
ORDER_STATUS result;
#ifdef TEST_MODE
   if(testMode)
	{
		cout << "==== Trying to process ";
		save(cout);
	}
#endif

if( orderPrototype_ == 0)
		return INVALID;
	if (executedOnDay_ == currentDay)
	{
#ifdef TEST_MODE
   if(testMode) cout << "==== Was already executed on this day" << endl;
#endif
		return FAILURE;
	}

	if (entity->isFullDayOrderFlagSet())
	{
#ifdef TEST_MODE
   if(testMode) cout << "==== Full day order Was already executed on this day" << endl;
#endif
		return FAILURE;
	}
    if(!orderPrototype_ ->mayBeProcessed(processingMode,entity))
    {
#ifdef TEST_MODE
   if(testMode) cout << "==== Order can't be processed duiring this mode" << endl;
#endif
		return FAILURE;
    }
  
	if((dayRestricted_ == 0) || (dayRestricted_== currentDay))
  {
    entity->setCurrentOrder(this);
	  result	=orderPrototype_ -> process(entity, parameters_);
    entity->setCurrentOrder(0);
   }
	 else
		return FAILURE;
	if((result == SUCCESS) ||(result == IN_PROGRESS))
		executedOnDay_ = currentDay;
d294 2
a295 2
   if((result == FAILURE) && isFullDayOrder()) // This order was already checked 
		executedOnDay_ = currentDay;
d297 1
a297 1
    return result;
d302 1
a302 2
ORDER_STATUS 
OrderLine::completeProcessing(Entity * entity, int result)
d304 4
a307 3
  entity->setCurrentOrder(this);
  ORDER_STATUS status	= orderPrototype_ -> completeOrderProcessing(entity, parameters_,result);
  entity->setCurrentOrder(0);
d312 2
a313 2
void
OrderLine::save(ostream &out)
d315 2
a316 2
    out << "ORDER ";
    printOrderLine(out);
a319 26
void
OrderLine::printOrderLine(ostream &out)
{
 vector< AbstractData *>::const_iterator iterator2;
	int i;
      if(dayRestricted_ != 0)    out << DAY_SPECIFIC_ORDER_SYMBOL << dayRestricted_<<" ";
      if(isPermanent_)    out << PERMANENT_ORDER_SYMBOL;
      for(i = 0; i< ifConditionLevel; i++)
							{
								out << IF_CONDITION_SYMBOL;
							}
      if(whileCondition_)    out << WHILE_CONDITION_SYMBOL;

      if(repetitionCounter_ > 1)    out << repetitionCounter_;
      if(reportFlags & NO_NORMAL_REPORT_FLAG)    out << NO_NORMAL_REPORT_SYMBOL;
      if(reportFlags & NO_ERROR_REPORT_FLAG)    out << NO_ERROR_REPORT_SYMBOL;


	if( orderPrototype_ != 0)
			{
      	orderPrototype_ -> save(out);
      	for (iterator2 = parameters_.begin(); iterator2 != parameters_.end(); iterator2++)
					{
	  				(*iterator2)->saveAsParameter(out);
					}
			}
d321 32
a352 1
      out << comment_ << endl;
d360 1
a360 1
  
d363 3
a365 1
void OrderLine::setReportingFlag(UINT flag)
d367 1
a367 1
  reportFlags |= translate_(flag);
d372 1
a372 1
void OrderLine::clearReportingFlag(UINT flag)
d374 2
a375 2
  reportFlags &= translate_(~flag);
  
d380 1
a380 1
bool OrderLine::getReportingFlag(UINT flag)
d382 1
a382 1
  return ( reportFlags &  translate_(flag));
d386 1
d394 1
a394 1
UINT OrderLine::translate_(UINT flag)
d403 2
a404 2
   return state_;
  }
d408 1
a408 1
void OrderLine::setProcessingState(PROCESSING_STATE state)
d410 2
a411 2
   state_ =  state;
  }
@


1.3
log
@ver 0.32
@
text
@d203 1
a203 1
  ORDER_STATUS status	= orderPrototype_ -> completeProcessing(entity, parameters_,result);
@


1.2
log
@version 0.30
@
text
@d2 1
a2 1
                          Order.cpp
d16 1
a16 1
Order::Order(const string & order, Entity * entity)
d18 1
a18 1
//    cout << entity->printName()<<" New Order created: " << order<<endl;
d35 3
a37 3
const UINT Order::NO_NORMAL_REPORT_FLAG = 0x01;
const UINT Order::NO_ERROR_REPORT_FLAG = 0x02;
bool Order::getCompletionFlag() const {return  isCompleted_;}
d41 1
a41 1
Order::~Order()
d57 1
a57 1
Order::parseModifiers(Parser * parser )
d117 3
d121 1
a121 1
Order::parse(Parser * parser, Entity * entity )
d139 3
a141 1
 }
d144 1
a144 1
Order::process(ProcessingMode * processingMode, Entity * entity, ostream &out)
d200 1
a200 1
Order::completeProcessing(Entity * entity, int result)
d210 1
a210 1
Order::save(ostream &out)
d213 1
a213 1
    print(out);
d218 1
a218 1
Order::print(ostream &out)
d248 2
a249 1
bool Order::isFullDayOrder()
d255 1
a255 1
void Order::setReportingFlag(UINT flag)
d259 4
a262 1
void Order::clearReportingFlag(UINT flag)
d267 4
a270 1
bool Order::getReportingFlag(UINT flag)
d280 4
a283 1
UINT Order::translate_(UINT flag)
d287 4
a290 1
PROCESSING_STATE Order::getProcessingState() const
d294 4
a297 1
void Order::setProcessingState(PROCESSING_STATE state)
@


1.1
log
@Version 0.23
@
text
@a12 1
extern OrderPrototypesCollection orderPrototypesCollection;
d22 1
d29 1
a29 1
  repetitionCounter_ = 1;
d37 4
d43 3
d47 2
a48 9
 vector<AbstractData *>::const_iterator iterator;

// delete parser_;
#ifdef TEST_MODE
//   if(testMode)  cout << "Order deleted" << endl;
#endif
// if(isParsed)
//  {
     for (iterator = parameters_.begin(); iterator != parameters_.end(); iterator++)
d50 1
a50 1
	 //delete *iterator;  Can't delete GameData objects!
d52 1
a52 1
//   }
d121 1
a121 1
 	orderPrototype_ = orderPrototypesCollection.find (tempKeyword);
d124 1
a124 1
     			cout  << "=xx= Parsing failed for order "<< tempKeyword << parser -> getText()<<endl;
d176 5
a180 1
	result	=orderPrototype_ -> process(entity, parameters_,this);
d192 2
d197 4
a200 1
  return orderPrototype_ -> completeProcessing(entity, parameters_,this,result);
d202 2
d207 8
a216 1
      out << "ORDER ";
@

