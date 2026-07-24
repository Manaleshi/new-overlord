head	1.5;
access;
symbols
	Version_0_6:1.5
	ver032:1.2;
locks; strict;
comment	@ * @;


1.5
date	2009.05.29.17.09.35;	author asakrana;	state Exp;
branches;
next	1.4;

1.4
date	2006.01.29.17.31.31;	author asakrana;	state Exp;
branches;
next	1.3;

1.3
date	2004.05.28.04.41.57;	author asakrana;	state Exp;
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


1.5
log
@Version 0.6
@
text
@/***************************************************************************
                          StudyOrder.h
                             -------------------
    begin                : Thu Feb 13 2003
    copyright            : (C) 2003 by Alex Dribin
    email                : Alex.Dribin@@gmail.com
 ***************************************************************************/

#ifndef STUDY_ORDER_H
#define STUDY_ORDER_H

#include "OrderPrototype.h"
class ReportPattern;
class SkillRule;
class UnitEntity;
class TeachingOffer;
/**
  *@@author Alex Dribin
  */

class StudyOrder : public OrderPrototype  {
public:
	StudyOrder();
	~StudyOrder(){}
  STATUS loadParameters(Parser * parser, ParameterList &parameters, Entity * entity );
  ORDER_STATUS process (Entity * entity, ParameterList &parameters);
    protected:
   ORDER_STATUS preProcess_(UnitEntity * unit, SkillRule * skill, int level);
   ORDER_STATUS doProcess_(UnitEntity * unit, SkillRule * skill, int level, TeachingOffer *teacher);
   bool teacherRequired_;
   static const  unsigned TEACHER_REQUIRED_REPORT_FLAG;
};

#endif
@


1.4
log
@Version 0.3.4 (Unfinished)
Includes combat engine
@
text
@d6 1
a6 1
    email                : alexliza@@netvision.net.il
@


1.3
log
@no message
@
text
@d25 2
a26 2
  STATUS loadParameters(Parser * parser, vector <AbstractData *>  &parameters, Entity * entity );
  ORDER_STATUS process (Entity * entity, vector <AbstractData *>  &parameters);
@


1.2
log
@version 0.30
@
text
@d2 1
a2 1
                          StudyOrder.h 
d13 1
a13 1
class Reporter;
d22 1
a22 1
public: 
@


1.1
log
@Version 0.23
@
text
@d26 1
a26 1
  ORDER_STATUS process (Entity * entity, vector <AbstractData *>  &parameters, Order * orderId);
d28 4
a31 2
   ORDER_STATUS preProcess_(UnitEntity * unit, SkillRule * skill, int level, Order * orderId);
   ORDER_STATUS doProcess_(UnitEntity * unit, SkillRule * skill, int level, TeachingOffer *teacher, Order * orderId);
@

