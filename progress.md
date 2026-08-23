## Functional requirments
1. need to add some edit/delete options. No options to delete/edit for the specilization, teacher, teacher mapping, and other objects also. 
2. also the academinc workflow it not good. mens currently admin have 3 options (program offering, subject offering, program & specillization), and they are look similar and not attached with other workflow. the flow should like this:
    - first we create School then we add -> program related to that school (like School = CSE and related program are (BCA, B.Tech) from the add prgram model/tab)
    - then each program have these values, (name, duration in year, number of semester, program code.) and these program linked to school.
    - then we add subjects in progam (related to program + semester) from the subject pool. 
    - after that we can map these classes with teacher (which is unique). 
    - also, the section part need some more attention, like suppose there is a section A in BBA - semester 1. and inside this section there are two groups create (PG1, PG2). Now teacher teach use case will be like this: 1. Teaher A teach a subject in whole section A, that means any assessment created will showed to all student of section A (including all groups). 2. Teacher B teach a subject (have maping) in Section A - PG1, so the create assessment will show only to PG1 group student of section A, PG2 or other student not able to see the assessment. 
    - if the teacher teach same subject in two different, programs, semester, or section, teacher have option to copy this current assessment for other students.
    - also use the BlockNote block editor for the assessment content (use the react island to intigrate this editor.) i have already created this, you just have to intigrate it (i will provide the required files for that editor.). 
    - use the same renderBock to show the content of the assessments in teacher and student dashboard.


## UI/UX requirements

- currently the dashboard is not looking good. 
- create it as the design as actual dashboard like the aside side bar and the main right content for functions, the side bar options is role based. 
- side bar like/tab and the main right section sub tabs (if have) preserve there location even after page reload. 
- add the links to side bar that reflect there related content in right main side bar. 
- use icon CDN fs for icons use. 
- proper Responsive to all screen size. 