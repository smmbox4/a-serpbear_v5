import React from 'react';
import Icon from './Icon';
import useOnKey from '../../hooks/useOnKey';

type ModalProps = {
   children: React.ReactNode,
   width?: string,
   title?: string,
   verticalCenter?: boolean,
   closeModal: Function,
}

const Modal = React.forwardRef<HTMLDivElement, ModalProps>(({
   children,
   width = '1/2',
   closeModal,
   title,
   verticalCenter = false,
}:ModalProps, ref) => {
   useOnKey('Escape', closeModal);

   const closeOnBGClick = (e:React.SyntheticEvent) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (e.target === e.currentTarget) { closeModal(); }
   };

   return (
      <div ref={ref} className='modal fixed top-0 left-0 bg-white/[.7] w-full h-dvh z-50 overflow-y-auto' onClick={closeOnBGClick}>
         <div
         className={`modal__content max-w-[340px] absolute left-0 right-0 ml-auto mr-auto w-${width}
         lg:max-w-md bg-white shadow-md rounded-md p-5 border-t-[1px] border-gray-100 text-base
         ${verticalCenter ? ' top-1/2 translate-y-[-50%]' : 'top-1/4'}`}>
            {title && <h3 className=' font-semibold mb-3'>{title}</h3>}
            <button
            className='modal-close absolute right-2 top-2 p-2 cursor-pointer text-gray-400 transition-all
             hover:text-gray-700 hover:rotate-90' onClick={() => closeModal()}>
               <Icon type="close" size={18} />
            </button>
            <div>{children}</div>
         </div>
      </div>
   );
});

Modal.displayName = 'Modal';

export default Modal;
