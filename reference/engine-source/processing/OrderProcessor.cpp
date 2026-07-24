head	1.3;
access;
symbols
	Version_0_6:1.2;
locks; strict;
comment	@// @;


1.3
date	2010.02.24.09.33.17;	author asakrana;	state Exp;
branches;
next	1.2;

1.2
date	2009.05.29.17.08.58;	author asakrana;	state Exp;
branches;
next	1.1;

1.1
date	2006.01.29.17.31.31;	author asakrana;	state Exp;
branches;
next	;


desc
@@


1.3
log
@*** empty log message ***
@
text
@/***************************************************************************
                          OrderProcessor.cpp
    Determine which orders to precess, maintain order list                .
                             -------------------
    begin                : Sun Oct 31 13:35:00 IST 2004
    copyright            : (C) 2004 by Alex Dribin
    email                : Alex.Dribin@@gmail.com
 ***************************************************************************/
#include "OrderProcessor.h"
#include "Entity.h"
#include "ProcessingMode.h"
#include "UnitEntity.h" //For Debugging only
extern bool testMode;
//  Processes all possible ( at this phase) orders for Entity.
// Each order processed only once
OrderProcessor orderProcessor;

bool OrderProcessor::process(Entity * entity, ProcessingMode * processingMode)

{
    bool orderWasExecuted = false;
    OrderIterator currentIterator;
    ORDER_STATUS result;

    //For Debugging only
    //   if(entity->isTraced())                                 //For Debugging only
    //     {                                                    //For Debugging only
    //       cout<< "Processing orders for Entity " << entity->print() <<endl; //For Debugging only
    //     }                                                   //For Debugging only

#ifdef TEST_MODE
    if (testMode) cout << "Processing orders for Entity " << entity->print() << endl;
#endif

    for (currentIterator = (entity->getOrderList()).begin();
            currentIterator != (entity->getOrderList()).end();)
    {
        //        if(entity->isTraced())                                  //For Debugging only
        //         {                                                      //For Debugging only
        //           cout <<"[->"; (*currentIterator)->printOrderLine(cout); //For Debugging only
        //         }                                                     //For Debugging only

        if ((*currentIterator)->ifConditionLevel > 0)
        {
            currentIterator++;
            continue;
        }
        if ((*currentIterator)->ifStatementLevel > 0)
        {
            currentIterator++;
            continue;
        }
        result = (*currentIterator) ->process(processingMode, entity);
        if (result == SUSPENDED) // second pass needed
            return true;

        orderWasExecuted = processOrderResults(entity, result, currentIterator);
    }// End of orders loop
    if (!orderWasExecuted)
    {
        ; // process default order for this Entity(processingMode,this,cout)
    }
    return orderWasExecuted;
}

bool OrderProcessor::processOrderResults(Entity * entity, ORDER_STATUS result, OrderIterator & currentIterator)
{
    assert(result != SUSPENDED);

    bool orderWasExecuted = false;
    if ((result == SUCCESS) || (result == IN_PROGRESS))
    {
        if ((*currentIterator)->isFullDayOrder())
        {
            //     cout << "Full-day order "; (*currentIterator)->save(cout); cout <<endl;
            entity->setLastOrder(*currentIterator);
            entity->setFullDayOrderFlag();
        }
    }

    if (result != FAILURE)
    {
        orderWasExecuted = true;
    }

    switch (result)
    {
        case SUCCESS:
        {
#ifdef TEST_MODE
            if (testMode) cout << "==== Result of order processing is Success" << endl;
#endif
            postProcessOrder(entity, result, currentIterator);
            if ((*currentIterator)->getCompletionFlag())
            {
                //delete (*currentIterator);
                currentIterator = (entity->getOrderList()).erase(currentIterator);
                break;
            }
            if ((*currentIterator) -> repetitionCounter() > 1)
            {
                (*currentIterator)->decrementRepetitionCounter();
                currentIterator++;
                break;
            }

            if ((*currentIterator)->isPermanent())
            {
                currentIterator++;
                break;
            }
            else
            {
                //delete (*currentIterator);
                currentIterator =
                        (entity->getOrderList()).erase(currentIterator);
            }
            break;
        }
        case FAILURE:
        {
#ifdef TEST_MODE
            if (testMode) cout << "==== Result of order processing is Failure" << endl;
#endif
            currentIterator++;
            break;
        }
        case INVALID:
        {
#ifdef TEST_MODE
            if (testMode) cout << "==== Result of order processing is Invalid" << endl;
#endif
            postProcessOrder(entity, result, currentIterator);

            (*currentIterator) -> ~OrderLine();
            currentIterator = (entity->getOrderList()).erase(currentIterator);
            break;
        }//end of INVALID case
        case IN_PROGRESS:
        {
#ifdef TEST_MODE
            if (testMode) cout << "==== Order is in progress" << endl;
#endif
            //              if((*currentIterator)->getCompletionFlag())
            //	      				{
            //				    			  delete (*currentIterator);
            //		    					  currentIterator = orders_.erase(currentIterator);
            //				 					  break;
            //		  					}

            if ((*currentIterator)->isPermanent())
            {
                currentIterator++;
                break;
            }
            if ((*currentIterator) -> repetitionCounter() == 1)
            {
                // this is equal to SUCCESS:
                postProcessOrder(entity, SUCCESS, currentIterator);
                currentIterator = (entity->getOrderList()).erase(currentIterator);
            }
            if ((*currentIterator) -> repetitionCounter() > 1)
            {
                (*currentIterator)->decrementRepetitionCounter();
                currentIterator++;
                break;
            }

            break;
        }
        case SUSPENDED:
        case WAITING: // Not used
            break;
            //default:
    }// End of result switch
    return orderWasExecuted;
}


/*
 * When order completed  state of all conditional orders depending on it
 * should be reexamined:
 * For successfuly completed orders "-" modifiers should be removed and
 * orders with "+" removed.
 * For orders completed with invalid status  "+" modifiers should be
 * removed and orders with "-" removed.

 */
void
OrderProcessor::postProcessOrder(Entity * entity, ORDER_STATUS result, OrderIterator  iter)

{
  OrderIterator    currentIterator = iter;
  currentIterator++;
  for ( ; currentIterator != (entity->getOrderList()).end(); )
    {
		if( !((*currentIterator)->whileCondition()) && !((*currentIterator)->ifConditionLevel > 0))
			return;
#ifdef TEST_MODE
   if(testMode)
			{
				cout << "====+++ Post-processing " ;      (*currentIterator)->save(cout);
			}
#endif
      switch(result)
			{
				case SUCCESS:
	  			{
	    		if ((*currentIterator)->ifConditionLevel > 0)
	      			{
					(*currentIterator)->ifConditionLevel--;
				}
		// Checking next conditional modifier
		// if it is "+" Order will be deleted in the next "if" (combination "-+" is illegal (?))
		// otherwise put "else"

	    		if ((*currentIterator)->whileCondition()) // Delete order
	      			{
					//(*currentIterator)->printOrderLine(cout);
#ifdef TEST_MODE
   if(testMode) 		cout << "====+++ Order deleted (condition failed)"<<endl;
#endif
				    	//delete (*currentIterator);
		    			currentIterator = (entity->getOrderList()).erase(currentIterator);
	      			}
	      		else
	      			{
		    				currentIterator++;
		    		}
	    		break;
	  		}
			case INVALID:
	  		{
	    		if ((*currentIterator)->whileCondition()) // +
	      		{
				(*currentIterator)->setWhileCondition(false);
					// Checking next conditional modifier
					// if any exists delete order
				if ((*currentIterator)->ifConditionLevel > 0) // Delete order (and Node)
		  			{
#ifdef TEST_MODE
   if(testMode) 		    cout << "====+++ Order deleted (impossible conditions)"<<endl;
#endif
		    			//delete (*currentIterator);
		    			currentIterator = (entity->getOrderList()).erase(currentIterator);
		  			}
				else
		    			currentIterator++;
	    			break;
	      		}

	    		if ((*currentIterator)->ifConditionLevel > 0) // Delete order
	      		{
				//(*currentIterator)->printOrderLine(cout);
#ifdef TEST_MODE
  if(testMode)		cout << " ====+++ Order deleted (condition failed) "<<endl;
#endif
				    	//delete (*currentIterator);
		    			currentIterator = (entity->getOrderList()).erase(currentIterator);
	      		}
	    		break;
	  		}
				case FAILURE:
				case IN_PROGRESS:
				case SUSPENDED:
			  case WAITING: // Not used
	    		break;
		} // switch

   }// end of for cycle
}







@


1.2
log
@Version 0.6
@
text
@d17 2
a18 1
bool  OrderProcessor::process(Entity * entity, ProcessingMode * processingMode)
d21 9
a29 9
  bool orderWasExecuted = false;
  OrderIterator currentIterator ;
  ORDER_STATUS result;
  
                                                     //For Debugging only
//   if(entity->isTraced())                                 //For Debugging only
//     {                                                    //For Debugging only
//       cout<< "Processing orders for Entity " << entity->print() <<endl; //For Debugging only
//     }                                                   //For Debugging only
d32 1
a32 1
 if(testMode) 	cout<< "Processing orders for Entity " << entity->print() <<endl;
d35 29
a63 27
   for( currentIterator = (entity->getOrderList()).begin();
	                      currentIterator != (entity->getOrderList()).end();)
     {
//        if(entity->isTraced())                                  //For Debugging only
//         {                                                      //For Debugging only
//           cout <<"[->"; (*currentIterator)->printOrderLine(cout); //For Debugging only
//         }                                                     //For Debugging only

        if( (*currentIterator)->ifConditionLevel > 0)
          {
                  currentIterator++;
                  continue;
          }
        if( (*currentIterator)->ifStatementLevel > 0)
          {
                  currentIterator++;
                  continue;
          }
      result = (*currentIterator) ->process(processingMode,  entity);
      if (result == SUSPENDED) // second pass needed
        return true;

      orderWasExecuted = processOrderResults(entity, result,currentIterator);
     }// End of orders loop
 if(!orderWasExecuted)
			; // process default order for this Entity(processingMode,this,cout)
   return orderWasExecuted;
d66 3
d70 10
d81 4
d86 4
a89 24
bool OrderProcessor::processOrderResults(Entity * entity, ORDER_STATUS result, OrderIterator & currentIterator)
{
  assert (result != SUSPENDED);

  bool orderWasExecuted = false;
  if((result == SUCCESS) || (result == IN_PROGRESS))
  {
    if ((*currentIterator)->isFullDayOrder())
      {
//     cout << "Full-day order "; (*currentIterator)->save(cout); cout <<endl;
       entity->setLastOrder(*currentIterator);
       entity->setFullDayOrderFlag();
      }
  }

  if(result != FAILURE )
   {
		orderWasExecuted = true;
   }

  switch (result)
  {
	case SUCCESS:
	  	{
d91 1
a91 1
   if(testMode) 	    cout << "==== Result of order processing is Success" << endl;
d93 29
a121 30
	    	postProcessOrder(entity, result, currentIterator);
              if((*currentIterator)->getCompletionFlag())
	      		{
		          //delete (*currentIterator);
		    	currentIterator = (entity->getOrderList()).erase(currentIterator);
			break;
		  	}
	    	if ((*currentIterator) -> repetitionCounter() > 1)
	      				{
         					(*currentIterator)->decrementRepetitionCounter()  ;
									currentIterator++;
				 					break;
	      				}

	    	if ((*currentIterator)->isPermanent())
	      				{
									currentIterator++;
				 					break;
	      				}

	    	else
	      		{
				    		 //delete (*currentIterator);
		    		currentIterator =
							(entity->getOrderList()).erase(currentIterator);
		  	}
		break;
	  	}
		case FAILURE:
	  	{
d123 1
a123 1
   if(testMode) 	    cout << "==== Result of order processing is Failure" << endl;
d125 5
a129 5
			currentIterator++;
	    		break;
	  	}
		case INVALID:
	  	{
d131 1
a131 1
   if(testMode) 	    cout << "==== Result of order processing is Invalid" << endl;
d133 1
a133 1
	    				postProcessOrder(entity, result, currentIterator);
d135 6
a140 6
				    	(*currentIterator) -> ~OrderLine();
		    			currentIterator = (entity->getOrderList()).erase(currentIterator);
	    				break;
	  	}//end of INVALID case
		case IN_PROGRESS:
                {
d142 1
a142 1
   if(testMode) 	    cout << "==== Order is in progress" << endl;
d144 33
a176 33
//              if((*currentIterator)->getCompletionFlag())
//	      				{
//				    			  delete (*currentIterator);
//		    					  currentIterator = orders_.erase(currentIterator);
//				 					  break;
//		  					}

                        if ((*currentIterator)->isPermanent())
	      			{
									currentIterator++;
				 					break;
	      			}
	    		if ((*currentIterator) -> repetitionCounter() == 1)
	      			{
                                        // this is equal to SUCCESS:	
                                  postProcessOrder(entity, SUCCESS, currentIterator); 
                                  currentIterator = (entity->getOrderList()).erase(currentIterator);
		  		}
	    		if ((*currentIterator) -> repetitionCounter() > 1)
	      				{
         					(*currentIterator)->decrementRepetitionCounter()  ;
									currentIterator++;
				 					break;
	      				}

	    	break;
                }
			case SUSPENDED:
			case WAITING: // Not used
	    				break;
	  //default:
				}// End of result switch
  return orderWasExecuted;
@


1.1
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d7 1
a7 1
    email                : alexliza@@netvision.net.il
d12 1
d23 7
d31 1
a31 1
   if(testMode) 	cout<< "Processing orders for Entity " << entity->print() <<endl;
d37 15
a51 10
			if( (*currentIterator)->ifConditionLevel > 0)
					{
						currentIterator++;
						continue;
					}
			if( (*currentIterator)->ifStatementLevel > 0)
					{
						currentIterator++;
						continue;
					}
d88 2
a89 2
					case SUCCESS:
	  				{
d93 1
a93 1
	    				postProcessOrder(entity, result, currentIterator);
d95 6
a100 6
	      				{
				    		 delete (*currentIterator);
		    				 currentIterator = (entity->getOrderList()).erase(currentIterator);
				 				 break;
		  					}
	    				if ((*currentIterator) -> repetitionCounter() > 1)
d107 1
a107 1
	    				if ((*currentIterator)->isPermanent())
d113 10
a122 9
	    				else
	      				{
				    		 delete (*currentIterator);
		    				 currentIterator = (entity->getOrderList()).erase(currentIterator);
		  					}
							break;
	  				}
			case FAILURE:
	  				{
d126 5
a130 5
							currentIterator++;
	    				break;
	  				}
			case INVALID:
	  				{
d139 3
a141 3
	  				}//end of INVALID case
			case IN_PROGRESS:
          {
d152 2
a153 2
          if ((*currentIterator)->isPermanent())
	      				{
d156 8
a163 7
	      				}
	    				if ((*currentIterator) -> repetitionCounter() == 1)
	      				{
				    		 delete (*currentIterator);
		    				 currentIterator = (entity->getOrderList()).erase(currentIterator);
		  					}
	    				if ((*currentIterator) -> repetitionCounter() > 1)
d170 2
a171 2
	    				break;
            }
d198 1
a198 1
			if( !((*currentIterator)->whileCondition()) && !((*currentIterator)->ifConditionLevel > 0))
d210 1
a210 1
	    			if ((*currentIterator)->ifConditionLevel > 0)
d212 2
a213 2
								(*currentIterator)->ifConditionLevel--;
							}
d218 1
a218 1
	    			if ((*currentIterator)->whileCondition()) // Delete order
d220 1
d224 1
a224 1
				    	delete (*currentIterator);
d230 1
a230 1
		    			}
d237 5
a241 5
					 		(*currentIterator)->setWhileCondition(false);
								// Checking next conditional modifier
								// if any exists delete order
							if ((*currentIterator)->ifConditionLevel > 0) // Delete order (and Node)
		  					{
d245 6
a250 6
		    					(*currentIterator)  ->  ~OrderLine();
		    						currentIterator = (entity->getOrderList()).erase(currentIterator);
		  					}
							else
		    						currentIterator++;
	    				break;
d255 1
d257 1
a257 1
   if(testMode) 		cout << "====+++ Order deleted (condition failed)"<<endl;
d259 1
a259 1
				    	(*currentIterator) -> ~OrderLine();
@

